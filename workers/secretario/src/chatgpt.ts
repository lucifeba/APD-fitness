import { getSetting, setSetting } from './db';
import type { ChatMessage, ChatResult, Env, ToolCall, ToolDef } from './env';
import { vaultDelete, vaultGet, vaultSet } from './tools/autonomyTools';
import { uid } from './util';

/**
 * "Entrar con ChatGPT": el mismo flujo de código de dispositivo que usa Codex CLI (y OpenClaw).
 * El usuario teclea un código corto en chatgpt.com y el agente recibe tokens OAuth con los que
 * llama a los modelos GPT a través del backend de Codex, cargando el uso a su suscripción
 * (Plus, Pro o Business). Los tokens se guardan cifrados en el baúl y se renuevan solos.
 */

const ISSUER = 'https://auth.openai.com';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const BACKEND = 'https://chatgpt.com/backend-api/codex';
export const VERIFICATION_URL = `${ISSUER}/codex/device`;
const VAULT_KEY = 'CHATGPT_TOKENS';
const DEVICE_KEY = 'chatgpt_device';
const COOKIE_KEY = 'chatgpt_cf_cookies';
/** Mismo formato de User-Agent que Codex CLI: la protección de chatgpt.com rechaza clientes sin identificar. */
const USER_AGENT = 'codex_cli_rs/0.153.2 (Mac OS 26.0.0; arm64) Terminal';

/** Cookies de Cloudflare (__cf_bm, cf_clearance…) que chatgpt.com espera ver de vuelta en la siguiente petición. */
let cfCookies: { at: number; value: string } | null = null;
async function loadCookies(env: Env): Promise<string> {
  if (cfCookies && Date.now() - cfCookies.at < 20 * 60_000) return cfCookies.value;
  const v = (await getSetting(env, COOKIE_KEY)) || '';
  cfCookies = { at: Date.now(), value: v };
  return v;
}
async function rememberCookies(env: Env, r: Response): Promise<void> {
  const set = (r.headers as any).getSetCookie ? ((r.headers as any).getSetCookie() as string[]) : [r.headers.get('set-cookie') || ''];
  const pairs = set
    .map((c) => c.split(';')[0].trim())
    .filter((c) => /^(__cf_bm|cf_clearance|_cfuvid)=/.test(c));
  if (!pairs.length) return;
  const current = new Map((await loadCookies(env)).split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const p of pairs) current.set(p.split('=')[0], p);
  const value = [...current.values()].join('; ');
  cfCookies = { at: Date.now(), value };
  await setSetting(env, COOKIE_KEY, value);
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  account_id: string;
  email?: string;
  /** Caducidad del access_token en ms (del JWT). */
  exp: number;
}

interface DeviceState {
  device_auth_id: string;
  user_code: string;
  interval: number;
  created: number;
}

function jwtPayload(token: string): any {
  try {
    const part = token.split('.')[1] || '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

function tokensFrom(j: any, previous?: Tokens): Tokens {
  const id = String(j.id_token || previous?.id_token || '');
  const claims = jwtPayload(id);
  const auth = claims['https://api.openai.com/auth'] || {};
  const profile = claims['https://api.openai.com/profile'] || {};
  const access = String(j.access_token);
  const accessClaims = jwtPayload(access);
  return {
    access_token: access,
    refresh_token: String(j.refresh_token || previous?.refresh_token || ''),
    id_token: id,
    account_id: String(auth.chatgpt_account_id || previous?.account_id || ''),
    email: String(profile.email || claims.email || previous?.email || ''),
    exp: Number(accessClaims.exp ? accessClaims.exp * 1000 : Date.now() + 50 * 60_000),
  };
}

async function loadTokens(env: Env): Promise<Tokens | null> {
  const raw = await vaultGet(env, VAULT_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

let cache: { at: number; tokens: Tokens | null } | null = null;

/** ¿Hay una cuenta de ChatGPT conectada? (cache de 2 min) */
export async function chatgptConnected(env: Env, force = false): Promise<Tokens | null> {
  if (!force && cache && Date.now() - cache.at < 120_000) return cache.tokens;
  const t = await loadTokens(env);
  cache = { at: Date.now(), tokens: t };
  return t;
}

export function chatgptForgetCache(): void {
  cache = null;
}

// ---------- Inicio de sesión por código de dispositivo ----------

export async function startDeviceLogin(env: Env): Promise<{ user_code: string; verification_url: string; interval: number }> {
  const r = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!r.ok) throw new Error(`OpenAI no ha aceptado la solicitud de código (HTTP ${r.status}).`);
  const j = await r.json<any>();
  const state: DeviceState = { device_auth_id: String(j.device_auth_id), user_code: String(j.user_code ?? j.usercode), interval: Number(j.interval) || 5, created: Date.now() };
  await setSetting(env, DEVICE_KEY, JSON.stringify(state));
  return { user_code: state.user_code, verification_url: VERIFICATION_URL, interval: state.interval };
}

/** Comprueba una vez si el usuario ya ha autorizado. Devuelve pending | connected | expired. */
export async function pollDeviceLogin(env: Env): Promise<{ status: 'pending' | 'connected' | 'expired' | 'none'; email?: string; error?: string }> {
  const raw = await getSetting(env, DEVICE_KEY);
  if (!raw) return { status: 'none' };
  const state = JSON.parse(raw) as DeviceState;
  if (Date.now() - state.created > 15 * 60_000) {
    await setSetting(env, DEVICE_KEY, '');
    return { status: 'expired' };
  }
  const r = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_auth_id: state.device_auth_id, user_code: state.user_code }),
  });
  if (r.status === 403 || r.status === 404) return { status: 'pending' };
  if (!r.ok) return { status: 'pending', error: `HTTP ${r.status}` };
  const j = await r.json<any>();
  // Canjeamos el código de autorización por tokens (PKCE que nos devuelve el propio servicio).
  const t = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(j.authorization_code),
      redirect_uri: `${ISSUER}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: String(j.code_verifier),
    }),
  });
  if (!t.ok) return { status: 'pending', error: `Canje de tokens fallido (HTTP ${t.status}): ${(await t.text()).slice(0, 200)}` };
  const tokens = tokensFrom(await t.json<any>());
  if (!tokens.account_id) return { status: 'pending', error: 'El token no incluye la cuenta de ChatGPT.' };
  await vaultSet(env, VAULT_KEY, JSON.stringify(tokens));
  await setSetting(env, DEVICE_KEY, '');
  chatgptForgetCache();
  return { status: 'connected', email: tokens.email };
}

export async function chatgptDisconnect(env: Env): Promise<void> {
  await vaultDelete(env, VAULT_KEY);
  await setSetting(env, DEVICE_KEY, '');
  chatgptForgetCache();
}

async function refresh(env: Env, tokens: Tokens): Promise<Tokens> {
  const r = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  if (!r.ok) throw new Error(`ChatGPT: no se pudo renovar la sesión (HTTP ${r.status}). Vuelve a conectar desde el panel.`);
  const next = tokensFrom(await r.json<any>(), tokens);
  await vaultSet(env, VAULT_KEY, JSON.stringify(next));
  chatgptForgetCache();
  return next;
}

async function validTokens(env: Env): Promise<Tokens> {
  let t = await loadTokens(env);
  if (!t) throw new Error('ChatGPT no está conectado. Conéctalo desde el panel.');
  if (t.exp - Date.now() < 5 * 60_000) t = await refresh(env, t);
  return t;
}

// ---------- Llamadas al modelo (Responses API por el backend de Codex) ----------

function toResponsesInput(messages: ChatMessage[]): { instructions: string; input: any[] } {
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const input: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: m.content }] });
    else if (m.role === 'assistant') {
      if (m.content) input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
      for (const c of m.tool_calls ?? []) input.push({ type: 'function_call', name: c.name, arguments: JSON.stringify(c.arguments ?? {}), call_id: c.id });
    } else if (m.role === 'tool') input.push({ type: 'function_call_output', call_id: m.tool_call_id ?? m.name ?? uid('call_'), output: m.content });
  }
  return { instructions, input };
}

/** Lee el flujo SSE y devuelve el objeto `response` final (evento response.completed). */
async function readSse(r: Response): Promise<any> {
  const text = await r.text();
  let final: any = null;
  let lastError: string | null = null;
  for (const block of text.split(/\n\n+/)) {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) continue;
    const data = dataLines.join('\n');
    if (data === '[DONE]') continue;
    try {
      const ev = JSON.parse(data);
      if (ev.type === 'response.completed' || ev.type === 'response.done') final = ev.response;
      else if (ev.type === 'response.failed') lastError = ev.response?.error?.message || 'response.failed';
      else if (ev.type === 'error') lastError = ev.error?.message || ev.message || 'error';
    } catch {
      /* fragmento no JSON */
    }
  }
  if (!final) throw new Error(lastError ? `ChatGPT: ${lastError}` : `ChatGPT: respuesta sin evento final (${text.slice(0, 200)})`);
  return final;
}

export async function callChatGPT(env: Env, model: string, messages: ChatMessage[], tools: ToolDef[], maxTokens: number): Promise<ChatResult> {
  const t = await validTokens(env);
  const { instructions, input } = toResponsesInput(messages);
  const body: any = {
    model,
    instructions,
    input,
    tool_choice: 'auto',
    parallel_tool_calls: true,
    reasoning: { effort: env.CHATGPT_REASONING || 'low', summary: 'auto' },
    store: false,
    stream: true,
    include: [],
    max_output_tokens: maxTokens,
  };
  if (tools.length) body.tools = tools.map((tl) => ({ type: 'function', name: tl.name, description: tl.description, parameters: tl.parameters, strict: false }));
  const headers: Record<string, string> = {
    authorization: `Bearer ${t.access_token}`,
    'ChatGPT-Account-ID': t.account_id,
    'content-type': 'application/json',
    accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    originator: 'codex_cli_rs',
    'User-Agent': USER_AGENT,
    'session-id': uid(''),
  };
  const cookies = await loadCookies(env);
  if (cookies) headers.cookie = cookies;
  // chatgpt.com bloquea las IPs de salida de Cloudflare Workers: si hay relé configurado, pasamos por él.
  const target = (env.CHATGPT_RELAY_URL || '').trim() || `${BACKEND}/responses`;
  const r = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body) });
  const upstreamCookies = r.headers.get('x-upstream-set-cookie');
  if (upstreamCookies) {
    try {
      const fake = new Response(null, { headers: (JSON.parse(upstreamCookies) as string[]).map((c) => ['set-cookie', c] as [string, string]) });
      await rememberCookies(env, fake);
    } catch {
      /* cookies del relé ilegibles */
    }
  } else await rememberCookies(env, r).catch(() => undefined);
  if (!r.ok) {
    const text = await r.text();
    const plain = text.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(`chatgpt ${r.status}: ${plain.slice(0, 300)}`);
  }
  const resp = await readSse(r);
  let content = '';
  const toolCalls: ToolCall[] = [];
  for (const item of resp.output ?? []) {
    if (item.type === 'message') {
      for (const c of item.content ?? []) if (c.type === 'output_text') content += c.text ?? '';
    } else if (item.type === 'function_call') {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(item.arguments || '{}');
      } catch {
        args = { input: item.arguments };
      }
      toolCalls.push({ id: item.call_id || item.id || uid('call_'), name: item.name, arguments: args });
    }
  }
  const usage = { input: Number(resp.usage?.input_tokens ?? 0), output: Number(resp.usage?.output_tokens ?? 0) };
  return { content: content.trim(), toolCalls, provider: 'chatgpt', model, usage };
}
