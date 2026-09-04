import type { Env } from './env';
import { remember } from './memory';
import { ask, embed } from './router';
import { clip, htmlToText, now, safeJson, uid } from './util';

/** Formatos que el conversor de Workers AI entiende. Imágenes aparte (usan modelos de visión). */
const CONVERTIBLE = /pdf|msword|wordprocessingml|spreadsheetml|ms-excel|opendocument|apple\.numbers|text\/html|xml|csv/i;
const TEXT_LIKE = /^text\/|json|csv|xml|markdown|yaml|x-sh|javascript|typescript/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|log|ts|js|py|html?|sql|ini|toml|env|sh|srt|vtt)$/i;
const CONVERT_EXT = /\.(pdf|docx?|xlsx?|xlsm|xlsb|ods|odt|numbers|htm|html|xml|csv)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|svg)$/i;

export const MAX_DOC_CHARS = 400_000;

export interface DocRow {
  id: string;
  title: string;
  source: string | null;
  mime: string | null;
  chars: number;
  chunks: number;
  summary: string | null;
  created_at: string;
}

export interface KnowledgeHit {
  doc_id: string;
  title: string;
  idx: number;
  content: string;
  score: number;
}

/** Extrae texto de cualquier archivo: texto plano directo, el resto con el conversor a Markdown de Workers AI. */
export async function extractText(env: Env, name: string, mime: string | undefined, bytes: ArrayBuffer): Promise<{ text: string; how: string }> {
  const m = mime || '';
  if ((TEXT_LIKE.test(m) && !/html|xml/i.test(m)) || (!m && TEXT_EXT.test(name) && !/\.(htm|html|xml)$/i.test(name))) {
    return { text: new TextDecoder().decode(bytes), how: 'texto' };
  }
  if (CONVERTIBLE.test(m) || CONVERT_EXT.test(name) || /^image\//.test(m) || IMAGE_EXT.test(name)) {
    const r: any = await (env.AI as any).toMarkdown({ name, blob: new Blob([bytes], { type: m || undefined }) }, { conversionOptions: { image: { descriptionLanguage: 'es' } } });
    if (r?.format === 'error') throw new Error(`No pude convertir ${name}: ${r.error}`);
    // El conversor antepone un bloque "## Metadata" con datos técnicos del archivo que no aportan conocimiento.
    const text = String(r?.data ?? '').replace(/^#[^\n]*\n+## Metadata\n(?:- [^\n]*\n)+/m, '').trim();
    if (!text) throw new Error(`El conversor no ha sacado texto de ${name}.`);
    return { text, how: `convertido (${r?.format ?? 'markdown'})` };
  }
  // Último intento: tratarlo como texto.
  const text = new TextDecoder().decode(bytes);
  if (/[ --]/.test(text.slice(0, 2000))) throw new Error(`No sé leer el formato de ${name} (${m || 'sin tipo'}).`);
  return { text, how: 'texto' };
}

/** Trocea un texto en fragmentos de ~`size` caracteres respetando párrafos, con solapamiento. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const paras = clean.split(/\n\n+/);
  const out: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
  };
  for (const p of paras) {
    if (p.length > size) {
      // Párrafo enorme: cortar por frases.
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((cur + ' ' + s).length > size) {
          push();
          cur = cur.slice(-overlap) + ' ' + s;
        } else cur += (cur ? ' ' : '') + s;
      }
      continue;
    }
    if ((cur + '\n\n' + p).length > size) {
      push();
      cur = cur.slice(-overlap) + '\n\n' + p;
    } else cur += (cur ? '\n\n' : '') + p;
  }
  push();
  return out;
}

const chunkId = (docId: string, idx: number) => `k_${docId}_${idx}`;

/**
 * Indexa un documento completo: guarda los fragmentos en D1, sus vectores en Vectorize (kind='doc'),
 * genera un resumen y extrae hechos duraderos a la memoria. Devuelve el registro creado.
 */
export async function ingestDocument(env: Env, doc: { title: string; text: string; source?: string; mime?: string }): Promise<DocRow & { facts: number }> {
  const text = doc.text.slice(0, MAX_DOC_CHARS);
  const id = uid('d_');
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('El documento está vacío.');
  const created = now();
  // Vectores por lotes.
  for (let i = 0; i < chunks.length; i += 16) {
    const batch = chunks.slice(i, i + 16);
    const vecs = await embed(env, batch);
    await env.VECTORS.upsert(vecs.map((values, j) => ({ id: chunkId(id, i + j), values, metadata: { kind: 'doc', doc_id: id, title: doc.title.slice(0, 60) } })));
  }
  // Fragmentos en D1 (lotes de 20 sentencias).
  for (let i = 0; i < chunks.length; i += 20) {
    await env.DB.batch(
      chunks.slice(i, i + 20).map((c, j) => env.DB.prepare('INSERT INTO doc_chunks(id,doc_id,idx,content,created_at) VALUES(?,?,?,?,?)').bind(chunkId(id, i + j), id, i + j, c, created)),
    );
  }
  let summary = '';
  let facts = 0;
  try {
    const out = await ask(
      env,
      'smart',
      `Resumes documentos para el asistente personal de un entrenador y consultor. Devuelve SOLO un objeto JSON, sin texto alrededor ni bloques de código: {"summary":"...","facts":[{"content":"...","kind":"fact|person|project|preference","importance":1-5}]}. "summary": 3 a 6 frases en español con qué es el documento, de quién, y los datos clave (cifras, fechas, nombres, decisiones). "facts": hasta 6 hechos duraderos y reutilizables que conviene recordar siempre (nada trivial), cada uno en una frase completa y autocontenida que incluya de quién o de qué habla (p. ej. "Marcelino Testez tiene un FTP de 285 W", nunca "FTP 285 W"). Si no hay hechos, [].`,
      `Título: ${doc.title}\n\n${clip(text, 9000)}`,
      1600,
    );
    let parsed = safeJson<{ summary?: string; facts?: { content: string; kind?: string; importance?: number }[] }>(out, {});
    if (!parsed.summary) {
      // Salida truncada o mal formada: rescatamos al menos el resumen y los hechos completos.
      console.warn('resumen sin JSON válido:', JSON.stringify(out.slice(0, 300)));
      const s = out.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const facts = [...out.matchAll(/\{\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"kind"\s*:\s*"(\w+)"\s*,\s*"importance"\s*:\s*(\d)/g)].map((m) => ({ content: m[1].replace(/\\"/g, '"'), kind: m[2], importance: Number(m[3]) }));
      parsed = { summary: s ? s[1].replace(/\\"/g, '"') : '', facts };
    }
    summary = String(parsed.summary ?? '').trim() || clip(text, 400);
    for (const f of (parsed.facts ?? []).slice(0, 6)) {
      if (!f?.content) continue;
      const mid = await remember(env, `${f.content} (fuente: ${doc.title})`, f.kind || 'fact', 'doc', Number(f.importance) || 3).catch(() => null);
      if (mid) facts++;
    }
  } catch (e: any) {
    console.warn('resumen documento', e?.message);
    summary = clip(text, 400);
  }
  await env.DB.prepare('INSERT INTO documents(id,title,source,mime,chars,chunks,summary,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id, doc.title.slice(0, 200), doc.source ?? 'tool', doc.mime ?? null, text.length, chunks.length, summary, created)
    .run();
  return { id, title: doc.title, source: doc.source ?? 'tool', mime: doc.mime ?? null, chars: text.length, chunks: chunks.length, summary, created_at: created, facts };
}

/** Descarga una URL y la indexa (HTML, PDF, etc. vía el conversor). */
export async function ingestUrl(env: Env, url: string, title?: string): Promise<DocRow & { facts: number }> {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Secretario/1.0', accept: 'text/html,application/pdf,application/json,text/plain,*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} al descargar ${url}`);
  const mime = (r.headers.get('content-type') || '').split(';')[0].trim();
  const bytes = await r.arrayBuffer();
  const name = title || decodeURIComponent(url.split('/').pop() || 'documento') || 'documento';
  let text: string;
  if (/html/i.test(mime)) {
    const html = new TextDecoder().decode(bytes);
    const main = html.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? html;
    text = htmlToText(main);
    if (!title) title = html.match(/<title[^>]*>([^<]{3,120})<\/title>/i)?.[1]?.trim();
  } else text = (await extractText(env, name, mime, bytes)).text;
  return ingestDocument(env, { title: (title || name).trim(), text, source: `url:${url}`.slice(0, 500), mime });
}

/** Búsqueda semántica sobre los documentos indexados. */
export async function searchKnowledge(env: Env, query: string, k = 6): Promise<KnowledgeHit[]> {
  if (!query.trim()) return [];
  try {
    const [vec] = await embed(env, [query]);
    const res = await env.VECTORS.query(vec, { topK: Math.min(50, k * 3), returnMetadata: 'none', filter: { kind: 'doc' } });
    const matches = (res.matches ?? []).filter((m) => m.score >= 0.4);
    if (!matches.length) return [];
    const ids = matches.map((m) => m.id);
    const rows = (
      await env.DB.prepare(
        `SELECT c.id, c.doc_id, c.idx, c.content, d.title FROM doc_chunks c JOIN documents d ON d.id=c.doc_id WHERE d.status='active' AND c.id IN (${ids.map(() => '?').join(',')})`,
      )
        .bind(...ids)
        .all<{ id: string; doc_id: string; idx: number; content: string; title: string }>()
    ).results;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: KnowledgeHit[] = [];
    for (const m of matches) {
      const row = byId.get(m.id);
      if (!row) continue;
      out.push({ doc_id: row.doc_id, title: row.title, idx: row.idx, content: row.content, score: m.score });
      if (out.length >= k) break;
    }
    return out;
  } catch (e: any) {
    console.warn('knowledge search', e?.message);
    return [];
  }
}

export async function listDocuments(env: Env, limit = 30): Promise<DocRow[]> {
  return (await env.DB.prepare("SELECT id,title,source,mime,chars,chunks,summary,created_at FROM documents WHERE status='active' ORDER BY created_at DESC LIMIT ?").bind(limit).all<DocRow>()).results;
}

export async function getDocument(env: Env, id: string): Promise<DocRow | null> {
  return (await env.DB.prepare("SELECT id,title,source,mime,chars,chunks,summary,created_at FROM documents WHERE id=? AND status='active'").bind(id).first<DocRow>()) ?? null;
}

/** Texto completo (o un tramo) de un documento, para leerlo entero cuando la búsqueda no basta. */
export async function readDocument(env: Env, id: string, fromIdx = 0, count = 8): Promise<{ title: string; total: number; from: number; text: string } | null> {
  const doc = await getDocument(env, id);
  if (!doc) return null;
  const rows = (await env.DB.prepare('SELECT idx,content FROM doc_chunks WHERE doc_id=? AND idx>=? ORDER BY idx LIMIT ?').bind(id, fromIdx, count).all<{ idx: number; content: string }>()).results;
  return { title: doc.title, total: doc.chunks, from: fromIdx, text: rows.map((r) => r.content).join('\n\n') };
}

export async function forgetDocument(env: Env, id: string): Promise<boolean> {
  const doc = await getDocument(env, id);
  if (!doc) return false;
  const ids = Array.from({ length: doc.chunks }, (_v, i) => chunkId(id, i));
  for (let i = 0; i < ids.length; i += 100) await env.VECTORS.deleteByIds(ids.slice(i, i + 100)).catch(() => undefined);
  await env.DB.batch([env.DB.prepare("UPDATE documents SET status='archived' WHERE id=?").bind(id), env.DB.prepare('DELETE FROM doc_chunks WHERE doc_id=?').bind(id)]);
  return true;
}

export async function countDocuments(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM documents WHERE status='active'").first<{ n: number }>();
  return Number(r?.n ?? 0);
}
