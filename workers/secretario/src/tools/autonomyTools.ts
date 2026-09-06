import { audit, getSetting, setSetting } from '../db';
import type { Env, ToolDef } from '../env';
import { clip, now, safeJson } from '../util';
import { bool, confirm, params, str, type ToolSpec } from './types';

// ---------- Baúl de credenciales (AES-GCM con clave derivada de ADMIN_TOKEN) ----------

async function vaultKey(env: Env): Promise<CryptoKey> {
  const secret = env.ADMIN_TOKEN || env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_BOT_TOKEN;
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`secretario-vault:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function vaultSet(env: Env, name: string, value: string): Promise<void> {
  const key = await vaultKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  await env.DB.prepare('INSERT INTO vault(name,value_enc,created_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET value_enc=excluded.value_enc, created_at=excluded.created_at')
    .bind(name, `${b64(iv)}.${b64(enc)}`, now())
    .run();
}

export async function vaultGet(env: Env, name: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value_enc FROM vault WHERE name=?').bind(name).first<{ value_enc: string }>();
  if (!row) return null;
  const [iv, data] = row.value_enc.split('.');
  const key = await vaultKey(env);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data));
  return new TextDecoder().decode(dec);
}

export async function vaultList(env: Env): Promise<string[]> {
  return (await env.DB.prepare('SELECT name FROM vault ORDER BY name').all<{ name: string }>()).results.map((r) => r.name);
}

export async function vaultDelete(env: Env, name: string): Promise<boolean> {
  const r = await env.DB.prepare('DELETE FROM vault WHERE name=?').bind(name).run();
  return Boolean(r.meta.changes);
}

export const normalizeSecretName = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 60);

/** Sustituye {{secret:NOMBRE}} por el valor del baúl y {{param}} por los argumentos. */
async function fill(env: Env, template: string, args: Record<string, unknown>): Promise<string> {
  let out = template;
  const secrets = [...template.matchAll(/\{\{\s*secret:([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  for (const name of new Set(secrets)) {
    const v = await vaultGet(env, normalizeSecretName(name));
    if (v === null) throw new Error(`Falta la credencial ${name}. Pide al usuario que la guarde con /secreto ${name} <valor>.`);
    out = out.replace(new RegExp(`\\{\\{\\s*secret:${name}\\s*\\}\\}`, 'g'), v);
  }
  out = out.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = args[k];
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  });
  return out;
}

const BLOCKED_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i;

/** Petición HTTP genérica con plantillas. Devuelve estado, tipo y cuerpo (JSON parseado si procede). */
export async function httpCall(
  env: Env,
  req: { method?: string; url: string; headers?: Record<string, string>; body?: string; extract?: string },
  args: Record<string, unknown> = {},
  maxChars = 12000,
): Promise<{ status: number; ok: boolean; content_type: string; body: unknown }> {
  const url = await fill(env, req.url, args);
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || BLOCKED_HOST.test(u.hostname)) throw new Error(`URL no permitida: ${url}`);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k] = await fill(env, String(v), args);
  if (!Object.keys(headers).some((h) => h.toLowerCase() === 'user-agent')) headers['user-agent'] = 'Secretario/1.0';
  const method = (req.method || 'GET').toUpperCase();
  const body = req.body && method !== 'GET' && method !== 'HEAD' ? await fill(env, req.body, args) : undefined;
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  const r = await fetch(url, { method, headers, body, redirect: 'follow' });
  const ct = r.headers.get('content-type') || '';
  const text = await r.text();
  let parsed: unknown = text;
  if (/json/i.test(ct) || /^\s*[[{]/.test(text)) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (req.extract && parsed && typeof parsed === 'object') parsed = pick(parsed, req.extract);
  let bodyOut: unknown;
  if (typeof parsed === 'string') bodyOut = clip(parsed, maxChars);
  else {
    const json = JSON.stringify(parsed ?? null);
    bodyOut = json.length <= maxChars ? parsed : { recortado: true, texto: clip(json, maxChars) };
  }
  return { status: r.status, ok: r.ok, content_type: ct, body: bodyOut };
}

/** Extrae una ruta con puntos y corchetes de un objeto: "data.items[0].name". */
function pick(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

// ---------- Herramientas dinámicas (creadas por el propio agente) ----------

interface DynParam {
  name: string;
  description: string;
  required?: boolean;
}

interface DynRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  extract?: string;
  needs_confirmation?: boolean;
}

interface DynRow {
  name: string;
  description: string;
  params_json: string;
  request_json: string;
  version: number;
  uses: number;
}

const RESERVED = new Set<string>();
export function reserveNames(names: string[]): void {
  for (const n of names) RESERVED.add(n);
}

export const normalizeToolName = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);

/** Carga las herramientas creadas por el agente como ToolSpec normales. */
export async function loadDynamicTools(env: Env): Promise<ToolSpec[]> {
  const rows = (await env.DB.prepare("SELECT name,description,params_json,request_json,version,uses FROM dyn_tools WHERE status='active' ORDER BY name").all<DynRow>()).results;
  return rows.map((row) => {
    const ps = safeJson<DynParam[]>(row.params_json, []);
    const req = safeJson<DynRequest>(row.request_json, { method: 'GET', url: '' });
    const def: ToolDef = {
      name: row.name,
      description: `${row.description} (herramienta creada por ti, v${row.version})`,
      parameters: params(Object.fromEntries(ps.map((p) => [p.name, str(p.description || p.name)])), ps.filter((p) => p.required).map((p) => p.name)),
    };
    const dangerous = Boolean(req.needs_confirmation) || !/^(GET|HEAD)$/i.test(req.method || 'GET');
    const spec: ToolSpec = {
      def,
      dangerous,
      run: async (a, ctx) => {
        if (dangerous && !ctx.confirmed) return confirm(`Ejecutar ${row.name} (${(req.method || 'GET').toUpperCase()} ${clip(req.url, 80)}) con ${JSON.stringify(a).slice(0, 200)}`);
        const r = await httpCall(ctx.env, req, a);
        await ctx.env.DB.prepare('UPDATE dyn_tools SET uses=uses+1 WHERE name=?').bind(row.name).run();
        return r;
      },
    };
    return spec;
  });
}

const SELF_PROMPT_MAX = 4000;

export const autonomyTools: ToolSpec[] = [
  {
    def: {
      name: 'self_instruct',
      description:
        'Modifica tus propias instrucciones permanentes (se añaden a tu prompt de sistema en todas las conversaciones futuras). Úsalo para fijar reglas, formatos, preferencias descubiertas o procedimientos que debes recordar siempre. Sé conciso: máximo 4000 caracteres en total.',
      parameters: params({ action: str('add | replace | clear', { enum: ['add', 'replace', 'clear'] }), text: str('Instrucción (para add/replace).') }, ['action']),
    },
    run: async (a, ctx) => {
      const current = (await getSetting(ctx.env, 'self_prompt')) || '';
      let next = current;
      if (a.action === 'clear') next = '';
      else if (a.action === 'replace') next = String(a.text ?? '').trim();
      else next = `${current}${current ? '\n' : ''}- ${String(a.text ?? '').trim().replace(/^-\s*/, '')}`;
      if (next.length > SELF_PROMPT_MAX) return { error: `Superarías el máximo de ${SELF_PROMPT_MAX} caracteres (${next.length}). Resume o usa replace.` };
      await setSetting(ctx.env, 'self_prompt', next);
      await audit(ctx.env, ctx.chatId, 'self_instruct', { action: a.action, text: a.text });
      return { ok: true, chars: next.length, instructions: next };
    },
  },
  {
    def: {
      name: 'http_request',
      description:
        'Llama a cualquier API o URL (GET, POST, PUT, PATCH, DELETE) con cabeceras y cuerpo. En url, headers y body puedes usar {{secret:NOMBRE}} para credenciales guardadas en el baúl (nunca pidas que te pasen la clave por chat: que el usuario la guarde con /secreto NOMBRE valor). Úsala para integrar servicios para los que no tienes herramienta; si funciona y se repetirá, conviértela en herramienta con tool_create. Las peticiones que modifican datos requieren confirmación.',
      parameters: params(
        {
          method: str('GET | POST | PUT | PATCH | DELETE', { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] }),
          url: str('URL completa.'),
          headers: { type: 'object', description: 'Cabeceras, p. ej. {"Authorization":"Bearer {{secret:API_X}}"}', additionalProperties: { type: 'string' } },
          body: str('Cuerpo (normalmente JSON en texto).'),
          extract: str('Opcional: ruta a extraer del JSON de respuesta, p. ej. data.items[0].name'),
        },
        ['url'],
      ),
    },
    dangerous: true,
    run: async (a, ctx) => {
      const method = String(a.method || 'GET').toUpperCase();
      const write = !/^(GET|HEAD)$/.test(method);
      if (write && !ctx.confirmed) return confirm(`Petición ${method} a ${clip(String(a.url), 90)}${a.body ? `\n${clip(String(a.body), 300)}` : ''}`);
      const r = await httpCall(ctx.env, { method, url: String(a.url), headers: (a.headers as Record<string, string>) || {}, body: a.body ? String(a.body) : undefined, extract: a.extract ? String(a.extract) : undefined });
      if (write) await audit(ctx.env, ctx.chatId, 'http_request', { method, url: a.url }, true);
      return r;
    },
  },
  {
    def: {
      name: 'tool_create',
      description:
        'Crea (o actualiza) una herramienta nueva y permanente a partir de una petición HTTP con plantillas. Úsala cuando descubras cómo hacer algo con una API que se repetirá. En url, headers y body usa {{nombre_param}} para los parámetros y {{secret:NOMBRE}} para credenciales del baúl. Después guarda una habilidad (skill_save) explicando cuándo usarla.',
      parameters: params(
        {
          name: str('Nombre en minúsculas con guiones bajos, p. ej. strava_actividades'),
          description: str('Qué hace y cuándo usarla, en una frase.'),
          params: { type: 'array', description: 'Parámetros de la herramienta.', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, required: { type: 'boolean' } }, required: ['name'] } },
          method: str('GET | POST | PUT | PATCH | DELETE', { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }),
          url: str('URL con plantillas, p. ej. https://api.x.com/v1/items?q={{query}}'),
          headers: { type: 'object', description: 'Cabeceras con plantillas.', additionalProperties: { type: 'string' } },
          body: str('Cuerpo con plantillas (JSON en texto).'),
          extract: str('Opcional: ruta del JSON de respuesta a devolver.'),
          needs_confirmation: bool('true si la herramienta modifica algo fuera (enviar, crear, borrar). Las que no son GET siempre piden confirmación.'),
        },
        ['name', 'description', 'url'],
      ),
    },
    run: async (a, ctx) => {
      const name = normalizeToolName(String(a.name));
      if (!name) return { error: 'Nombre inválido.' };
      if (RESERVED.has(name)) return { error: `"${name}" es una herramienta fija; elige otro nombre.` };
      try {
        new URL(String(a.url).replace(/\{\{[^}]+\}\}/g, 'x'));
      } catch {
        return { error: 'URL inválida.' };
      }
      const ps: DynParam[] = Array.isArray(a.params) ? a.params.filter((p: any) => p?.name).map((p: any) => ({ name: normalizeToolName(String(p.name)), description: String(p.description ?? ''), required: Boolean(p.required) })) : [];
      const req: DynRequest = {
        method: String(a.method || 'GET').toUpperCase(),
        url: String(a.url),
        headers: (a.headers as Record<string, string>) || {},
        body: a.body ? String(a.body) : undefined,
        extract: a.extract ? String(a.extract) : undefined,
        needs_confirmation: Boolean(a.needs_confirmation),
      };
      const existing = await ctx.env.DB.prepare('SELECT version FROM dyn_tools WHERE name=?').bind(name).first<{ version: number }>();
      if (existing)
        await ctx.env.DB.prepare("UPDATE dyn_tools SET description=?, params_json=?, request_json=?, version=version+1, status='active', updated_at=? WHERE name=?")
          .bind(String(a.description), JSON.stringify(ps), JSON.stringify(req), now(), name)
          .run();
      else
        await ctx.env.DB.prepare('INSERT INTO dyn_tools(name,description,params_json,request_json,created_at,updated_at) VALUES(?,?,?,?,?,?)')
          .bind(name, String(a.description), JSON.stringify(ps), JSON.stringify(req), now(), now())
          .run();
      await audit(ctx.env, ctx.chatId, 'tool_create', { name, version: (existing?.version ?? 0) + 1 });
      return { created: true, name, version: (existing?.version ?? 0) + 1, nota: 'Disponible a partir del siguiente mensaje. Pruébala con http_request si quieres validarla ahora.' };
    },
  },
  {
    def: {
      name: 'tool_list',
      description: 'Lista las herramientas que has creado tú, con su definición.',
      parameters: params({}),
    },
    run: async (_a, ctx) =>
      (await ctx.env.DB.prepare("SELECT name,description,params_json,request_json,version,uses FROM dyn_tools WHERE status='active' ORDER BY name").all<DynRow>()).results.map((r) => ({
        name: r.name,
        description: r.description,
        params: safeJson(r.params_json, []),
        request: safeJson(r.request_json, {}),
        version: r.version,
        uses: r.uses,
      })),
  },
  {
    def: {
      name: 'tool_delete',
      description: 'Elimina una herramienta creada por ti. Requiere confirmación del usuario.',
      parameters: params({ name: str('Nombre de la herramienta.') }, ['name']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Eliminar la herramienta ${a.name}`);
      const r = await ctx.env.DB.prepare("UPDATE dyn_tools SET status='deleted', updated_at=? WHERE name=?").bind(now(), normalizeToolName(String(a.name))).run();
      return { deleted: Boolean(r.meta.changes) };
    },
  },
  {
    def: {
      name: 'secret_list',
      description: 'Lista los nombres de las credenciales guardadas en el baúl (nunca los valores). Para guardar una nueva, el usuario debe escribir /secreto NOMBRE valor.',
      parameters: params({}),
    },
    run: async (_a, ctx) => ({ secrets: await vaultList(ctx.env) }),
  },
];

/** Instrucciones que el agente se ha dado a sí mismo, para inyectar en el prompt. */
export async function selfPrompt(env: Env): Promise<string> {
  const learned = (await getSetting(env, 'self_prompt')) || '';
  const admin = (await getSetting(env, 'admin_prompt')) || '';
  return `${learned}\n\nInstrucciones del administrador (prioridad sobre preferencias aprendidas):\n${admin}`;
}
