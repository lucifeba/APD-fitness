import type { Env } from './env';
import { embed } from './router';
import { now, uid } from './util';

export interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  created_at: string;
  score?: number;
}

/** Guarda un recuerdo si no existe uno casi idéntico. Devuelve el id o null si era duplicado. */
export async function remember(env: Env, content: string, kind = 'fact', source = 'chat', importance = 3): Promise<string | null> {
  const text = content.trim();
  if (text.length < 8) return null;
  const [vec] = await embed(env, [text]);
  const near = await env.VECTORS.query(vec, { topK: 1, returnMetadata: 'none' });
  const top = near.matches?.[0];
  if (top && top.score >= 0.94) {
    await env.DB.prepare('UPDATE memories SET uses=uses+1, last_used_at=? WHERE id=?').bind(now(), top.id).run();
    return null;
  }
  const id = uid('m_');
  await env.DB.prepare('INSERT INTO memories(id,kind,content,source,importance,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id, kind, text, source, Math.min(5, Math.max(1, importance)), now())
    .run();
  await env.VECTORS.upsert([{ id, values: vec, metadata: { kind } }]);
  return id;
}

export async function recall(env: Env, query: string, k = 6): Promise<Memory[]> {
  if (!query.trim()) return [];
  try {
    const [vec] = await embed(env, [query]);
    const res = await env.VECTORS.query(vec, { topK: k * 2, returnMetadata: 'none' });
    const ids = (res.matches ?? []).filter((m) => m.score >= 0.45).map((m) => m.id);
    if (!ids.length) return [];
    const rows = (
      await env.DB.prepare(`SELECT id,kind,content,importance,created_at FROM memories WHERE status='active' AND id IN (${ids.map(() => '?').join(',')})`)
        .bind(...ids)
        .all<Memory>()
    ).results;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: Memory[] = [];
    for (const m of res.matches ?? []) {
      const row = byId.get(m.id);
      if (row) out.push({ ...row, score: m.score });
      if (out.length >= k) break;
    }
    if (out.length)
      await env.DB.prepare(`UPDATE memories SET uses=uses+1, last_used_at=? WHERE id IN (${out.map(() => '?').join(',')})`)
        .bind(now(), ...out.map((m) => m.id))
        .run();
    return out;
  } catch (e) {
    console.warn('recall falló', e);
    return [];
  }
}

export async function archiveMemory(env: Env, id: string): Promise<boolean> {
  const r = await env.DB.prepare("UPDATE memories SET status='archived' WHERE id=? AND status='active'").bind(id).run();
  if (r.meta.changes) {
    await env.VECTORS.deleteByIds([id]).catch(() => undefined);
    return true;
  }
  return false;
}

export async function listMemories(env: Env, limit = 20, query?: string): Promise<Memory[]> {
  if (query) return recall(env, query, limit);
  return (
    await env.DB.prepare("SELECT id,kind,content,importance,created_at FROM memories WHERE status='active' ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<Memory>()
  ).results;
}

export async function countMemories(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM memories WHERE status='active'").first<{ n: number }>();
  return Number(r?.n ?? 0);
}
