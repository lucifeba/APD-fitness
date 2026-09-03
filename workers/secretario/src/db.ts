import type { Env } from './env';
import { now, today } from './util';

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
  )
    .bind(key, value, now())
    .run();
}

/** Devuelve true la primera vez que se ve la clave. Sirve para no repetir avisos. */
export async function receipt(env: Env, key: string): Promise<boolean> {
  const seen = await env.DB.prepare('SELECT 1 AS x FROM receipts WHERE key=?').bind(key).first();
  if (seen) return false;
  await env.DB.prepare('INSERT OR IGNORE INTO receipts(key,created_at) VALUES(?,?)').bind(key, now()).run();
  return true;
}

export async function audit(env: Env, chatId: string | null, action: string, detail: unknown, confirmed = false): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_log(chat_id,action,detail,confirmed,created_at) VALUES(?,?,?,?,?)')
    .bind(chatId, action, typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 4000), confirmed ? 1 : 0, now())
    .run();
}

export async function recordUsage(
  env: Env,
  provider: string,
  model: string,
  input: number,
  output: number,
  neurons: number,
  error = false,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage_daily(day,provider,model,calls,input_tokens,output_tokens,neurons,errors) VALUES(?,?,?,1,?,?,?,?)
     ON CONFLICT(day,provider,model) DO UPDATE SET calls=calls+1, input_tokens=input_tokens+excluded.input_tokens,
     output_tokens=output_tokens+excluded.output_tokens, neurons=neurons+excluded.neurons, errors=errors+excluded.errors`,
  )
    .bind(today(), provider, model, input, output, neurons, error ? 1 : 0)
    .run();
}

export async function neuronsToday(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(neurons),0) AS n FROM usage_daily WHERE day=? AND provider='cf'")
    .bind(today())
    .first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function usageSummary(env: Env): Promise<string> {
  const rows = (
    await env.DB.prepare('SELECT provider,model,calls,input_tokens,output_tokens,neurons,errors FROM usage_daily WHERE day=? ORDER BY calls DESC')
      .bind(today())
      .all<any>()
  ).results;
  if (!rows.length) return 'Sin uso hoy.';
  return rows
    .map(
      (r) =>
        `${r.provider} ${r.model}: ${r.calls} llamadas, ${r.input_tokens}/${r.output_tokens} tokens${
          r.provider === 'cf' ? `, ~${Math.round(r.neurons)} neuronas` : ''
        }${r.errors ? `, ${r.errors} errores` : ''}`,
    )
    .join('\n');
}
