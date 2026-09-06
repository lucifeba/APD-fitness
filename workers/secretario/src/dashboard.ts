import { getSetting } from './db';
import type { Env } from './env';
import { googleConfigured } from './google';
import { countDocuments, listDocuments } from './knowledge';
import { countMemories } from './memory';
import { chatgptConnected, VERIFICATION_URL } from './chatgpt';
import { forgetOpenAIKeyCache, probeProviders, resolveOpenAIKey } from './router';
import { vaultDelete, vaultList, vaultSet } from './tools/autonomyTools';
import { localTime, today } from './util';

/**
 * Panel web del agente: estado, uso, conocimiento, herramientas y conexión de OpenAI.
 * Acceso con "Entrar con Google" restringido al propietario (OWNER_EMAIL) y a ADMIN_EMAILS.
 */

const COOKIE = 'nv_sess';
const SESSION_DAYS = 30;

// ---------- Sesión firmada (HMAC con ADMIN_TOKEN) ----------

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`panel:${env.ADMIN_TOKEN || env.TELEGRAM_BOT_TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeSession(env: Env, email: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${btoa(email).replace(/=+$/, '')}.${exp}`;
  return `${payload}.${await hmac(env, payload)}`;
}

export async function sessionEmail(req: Request, env: Env): Promise<string | null> {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [b64, exp, sig] = m[1].split('.');
  if (!b64 || !exp || !sig || Number(exp) < Date.now()) return null;
  if ((await hmac(env, `${b64}.${exp}`)) !== sig) return null;
  try {
    const email = atob(b64);
    return allowedEmail(env, email) ? email : null;
  } catch {
    return null;
  }
}

function allowedEmail(env: Env, email: string): boolean {
  const e = email.trim().toLowerCase();
  const allowed = [env.OWNER_EMAIL || '', ...(env.ADMIN_EMAILS || '').split(',')].map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(e);
}

const cookieHeader = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- OAuth de Google para entrar (solo identidad) ----------

export function loginRedirect(env: Env, state: string): Response {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || '',
    redirect_uri: `${env.PUBLIC_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    login_hint: env.OWNER_EMAIL || '',
  });
  return new Response(null, {
    status: 302,
    headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, 'set-cookie': `nv_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
  });
}

export async function loginCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = (req.headers.get('cookie') || '').match(/(?:^|;\s*)nv_state=([^;]+)/)?.[1];
  if (!code || !state || state !== cookieState) return page(env, errorCard('El enlace de acceso no es válido o ha caducado. Vuelve a intentarlo.'), 400);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: `${env.PUBLIC_URL}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const j = await r.json<any>();
  if (!r.ok || !j.access_token) return page(env, errorCard('Google no ha devuelto un acceso válido.'), 400);
  const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${j.access_token}` } });
  const info = await u.json<any>();
  const email = String(info.email || '').toLowerCase();
  if (!u.ok || info.email_verified !== true || !email || !allowedEmail(env, email)) return page(env, errorCard(`La cuenta ${email || 'usada'} no tiene acceso a este panel. Entra con ${env.OWNER_EMAIL}.`), 403);
  const sess = await makeSession(env, email);
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookieHeader(sess, SESSION_DAYS * 86_400) } });
}

export function logout(): Response {
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookieHeader('', 0) } });
}

// ---------- API del panel ----------

export async function statusJson(env: Env): Promise<Record<string, unknown>> {
  const [usage, nDocs, docs, nMem, tools, secrets, audit, selfPrompt, ownerChat, googleOk, openaiKey, lastEpisode] = await Promise.all([
    env.DB.prepare('SELECT provider,model,calls,input_tokens,output_tokens,neurons,errors FROM usage_daily WHERE day=? ORDER BY calls DESC')
      .bind(today())
      .all<any>()
      .then((r) => r.results),
    countDocuments(env),
    listDocuments(env, 8),
    countMemories(env),
    env.DB.prepare("SELECT name,description,version,uses FROM dyn_tools WHERE status='active' ORDER BY uses DESC")
      .all<any>()
      .then((r) => r.results),
    vaultList(env),
    env.DB.prepare('SELECT action,detail,confirmed,created_at FROM audit_log ORDER BY id DESC LIMIT 12')
      .all<any>()
      .then((r) => r.results),
    getSetting(env, 'self_prompt'),
    getSetting(env, 'owner_chat_id'),
    googleConfigured(env),
    resolveOpenAIKey(env, true),
    env.DB.prepare('SELECT created_at FROM audit_log ORDER BY id DESC LIMIT 1').first<{ created_at: string }>(),
  ]);
  const gpt = await chatgptConnected(env, true);
  const neurons = usage.filter((u: any) => u.provider === 'cf').reduce((n: number, u: any) => n + Number(u.neurons || 0), 0);
  const chain = (env.MODEL_CHAIN_SMART || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const keyFor = (p: string) =>
    p === 'cf' ? true : p === 'gemini' ? Boolean(env.GEMINI_API_KEY) : p === 'groq' ? Boolean(env.GROQ_API_KEY) : p === 'openrouter' ? Boolean(env.OPENROUTER_API_KEY) : p === 'openai' ? Boolean(openaiKey) : p === 'chatgpt' ? Boolean(gpt) : false;
  return {
    brand: { name: env.BRAND_NAME || 'Secretario', tagline: env.BRAND_TAGLINE || '' },
    owner: { name: env.OWNER_NAME, email: env.OWNER_EMAIL, tz: env.TIMEZONE || 'Europe/Madrid', localTime: localTime(env.TIMEZONE || 'Europe/Madrid') },
    bot: { name: env.BOT_NAME, paired: Boolean(env.OWNER_CHAT_ID || ownerChat), publicUrl: env.PUBLIC_URL },
    google: { connected: googleOk, configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) },
    openai: { connected: Boolean(openaiKey), fromSecret: Boolean(env.OPENAI_API_KEY) },
    chatgpt: { connected: Boolean(gpt), email: gpt?.email || '', verificationUrl: VERIFICATION_URL },
    brains: chain.map((c) => ({ id: c, provider: c.split(':')[0], model: c.slice(c.indexOf(':') + 1), configured: keyFor(c.split(':')[0]) })),
    usage: { rows: usage, neurons: Math.round(neurons), budget: Number(env.DAILY_NEURON_BUDGET || 9000) },
    knowledge: { count: nDocs, recent: docs.map((d) => ({ id: d.id, title: d.title, chunks: d.chunks, date: d.created_at.slice(0, 10), summary: (d.summary || '').slice(0, 220) })) },
    memory: { count: nMem },
    tools,
    secrets,
    audit: audit.map((a: any) => ({ action: a.action, detail: String(a.detail || '').slice(0, 160), confirmed: Boolean(a.confirmed), at: a.created_at })),
    selfPrompt: selfPrompt || '',
    config: { dailyBrief: env.DAILY_BRIEF || '', quietHours: env.QUIET_HOURS || '', defaultTaskList: env.DEFAULT_TASK_LIST || '', heartbeat: (env.HEARTBEAT_ENABLED ?? 'true') === 'true' },
    lastActivity: lastEpisode?.created_at ?? null,
  };
}

export async function connectOpenAI(env: Env, key: string): Promise<{ ok: boolean; error?: string; models?: number }> {
  const k = key.trim();
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(k)) return { ok: false, error: 'Eso no parece una clave de OpenAI (empiezan por sk-).' };
  const r = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${k}` } });
  if (!r.ok) return { ok: false, error: `OpenAI ha rechazado la clave (HTTP ${r.status}).` };
  const j = await r.json<any>();
  await vaultSet(env, 'OPENAI_API_KEY', k);
  forgetOpenAIKeyCache();
  return { ok: true, models: (j.data ?? []).length };
}

export async function disconnectOpenAI(env: Env): Promise<void> {
  await vaultDelete(env, 'OPENAI_API_KEY');
  forgetOpenAIKeyCache();
}

export async function probeJson(env: Env): Promise<unknown> {
  return probeProviders(env, 'smart');
}

// ---------- HTML ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function errorCard(msg: string): string {
  return `<section class="card center"><h2>No se ha podido entrar</h2><p class="muted">${esc(msg)}</p><a class="btn" href="/">Volver</a></section>`;
}

export function page(env: Env, body: string, status = 200): Response {
  const brand = esc(env.BRAND_NAME || 'Secretario');
  const tagline = esc(env.BRAND_TAGLINE || '');
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brand} · Panel</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="bg"><span class="blob a"></span><span class="blob b"></span></div>
<header class="top"><a class="brand" href="/">${LOGO}<span><b>${brand}</b><small>${tagline}</small></span></a><nav id="nav"></nav></header>
<main id="app">${body}</main>
<footer class="foot">${brand} · agente personal en Cloudflare · <span id="clock"></span></footer>
<script>${JS}</script></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

export function landing(env: Env): string {
  return `<section class="hero"><p class="eyebrow">Panel del agente</p><h1>Tu secretaria digital,<br><em>siempre al día</em>.</h1>
<p class="lead">Estado del bot de Telegram, conexiones con Google y OpenAI, uso de inteligencia artificial, conocimiento aprendido y actividad reciente.</p>
<a class="btn primary" href="/auth/google">${GOOGLE_ICON} Entrar con Google</a>
<p class="muted small">Acceso reservado a ${esc(env.OWNER_EMAIL || 'la propietaria')}.</p></section>`;
}

/** Páginas legales mínimas que Google exige para publicar la app OAuth. */
export function legalPage(env: Env, kind: 'privacidad' | 'condiciones'): string {
  const brand = esc(env.BRAND_NAME || 'Secretario');
  const owner = esc(env.OWNER_EMAIL || '');
  if (kind === 'privacidad')
    return `<section class="card"><h2>Política de privacidad</h2>
<p class="muted">${brand} es un asistente personal de uso privado para una única persona (${owner}). Accede, con autorización expresa de esa persona y mediante OAuth de Google, a su correo, calendario, archivos de Drive y tareas, exclusivamente para ejecutar las órdenes que ella le da por Telegram y preparar sus resúmenes de agenda.</p>
<p class="muted">Los datos se procesan en Cloudflare (Workers, D1 y Vectorize) y no se comparten con terceros ni se usan para publicidad ni para entrenar modelos. Los tokens de acceso se guardan cifrados y pueden revocarse en cualquier momento desde la cuenta de Google (Seguridad → Aplicaciones de terceros) o desconectando el servicio en este panel. El uso de datos de Google cumple la Política de datos de usuario de los servicios de API de Google, incluidos los requisitos de uso limitado.</p>
<p class="muted">Contacto: ${owner}.</p><a class="btn" href="/">Volver</a></section>`;
  return `<section class="card"><h2>Condiciones del servicio</h2>
<p class="muted">${brand} se ofrece tal cual, como herramienta privada de productividad para su propietaria. No hay registro público ni terceros usuarios. La propietaria es responsable de las órdenes que da al asistente; las acciones que modifican datos externos (enviar correos, crear o borrar eventos, cambiar archivos) requieren siempre su confirmación explícita.</p>
<p class="muted">Contacto: ${owner}.</p><a class="btn" href="/">Volver</a></section>`;
}

export function appShell(email: string): string {
  const programming = email.toLowerCase() === 'info@apdsport.com' ? `<details class="card"><summary>Programación del agente · Administrador</summary><p>Estas instrucciones se aplican al agente. Revísalas antes de guardar.</p><textarea id="programming" aria-label="Instrucciones del agente" maxlength="20000" rows="12" style="width:100%"></textarea><p><button class="btn" onclick="loadProgramming()">Cargar instrucciones</button> <button class="btn primary" onclick="saveProgramming()">Guardar instrucciones</button></p><p id="programming-status" role="status"></p></details>` : '';
  return `<nav aria-label="Secciones" style="flex-wrap:wrap;margin-bottom:20px"><button class="btn" onclick="showPanel('dashboard')">Dashboard</button><button class="btn" onclick="showPanel('crm')">CRM</button><button class="btn" onclick="showPanel('operative')">Operativa</button>${programming ? '<button class="btn" onclick="showPanel(\'admin\')">Programación del agente</button>' : ''}</nav>
  <div id="panel-crm" hidden><section class="card"><h2>CRM · Actividad y acompañamientos</h2><p class="muted">Registra visitas y seguimiento de delegados. Los registros guardados aquí están pendientes de incorporar al Excel; la importación y sincronización todavía no están disponibles.</p><label>Sección <select id="crm-section" onchange="loadCrm()"><option value="visits">Visitas</option><option value="accompaniments">Acompañamientos</option></select></label> <button class="btn" onclick="newCrm()">Nuevo registro</button> <button class="btn" onclick="loadCrm()">Actualizar listado</button><p><label>Buscar <input id="crm-search" type="search" oninput="renderCrm()" placeholder="Cliente, delegado, ruta…"></label></p><p id="crm-status" role="status"></p><div id="crm-list" style="overflow:auto"></div><form id="crm-form" hidden onsubmit="saveCrm(event)"><h3 id="crm-editor-title">Registro</h3><div id="crm-fields" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px"></div><p><button class="btn primary">Guardar registro</button> <button type="button" class="btn" onclick="closeCrm()">Cerrar</button></p></form></section></div>
  <div id="panel-admin" hidden>${programming}</div>
  <div id="panel-operative" hidden><section class="card"><h2>Conversación compartida</h2><p class="muted">Web y Telegram comparten el contexto. Las acciones pendientes se confirman en Telegram.</p><div id="conversation" role="log" aria-live="polite" style="max-height:480px;overflow:auto"></div><form onsubmit="sendWebMessage(event)"><label for="message">Mensaje, idea para un borrador o transcripción</label><textarea id="message" rows="4" maxlength="16000" required style="width:100%"></textarea><button id="send-message" class="btn primary">Enviar</button><p id="chat-status" role="status"></p></form></section>
  <section class="card"><h2>Borrador de correo</h2><p class="muted">Para que la IA lo redacte, escribe tu idea en la conversación. Aquí puedes revisar el texto y guardarlo en Gmail.</p><form onsubmit="saveDraft(event)"><label>Destinatario <input type="email" id="draft-to"></label><label>Asunto <input type="text" id="draft-subject" required></label><label>Cuerpo <textarea id="draft-body" rows="8" required style="width:100%"></textarea></label><button class="btn primary">Guardar en borradores de Gmail</button><p id="draft-status" role="status"></p></form></section>
  <section class="card"><h2>Conocimiento y documentos</h2><form onsubmit="uploadKnowledge(event)"><label>Documento <input type="file" id="knowledge-file" required></label><button class="btn">Añadir al conocimiento</button><p id="knowledge-status" role="status"></p></form></section></div>
  <div id="panel-dashboard"><section class="card"><label for="accent">Color del panel</label> <input id="accent" type="color" value="#8b7cf6" onchange="setAccent(this.value)"></section><div data-email="${esc(email)}" id="shell"><section class="card center"><p class="muted">Cargando estado…</p></section></div></div>`;
}

const LOGO = `<svg class="logo" viewBox="0 0 48 48" fill="none" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="48" y2="48"><stop stop-color="#8B7CF6"/><stop offset="1" stop-color="#5DD3F0"/></linearGradient></defs><path d="M14 34a9 9 0 0 1-1-17.9A12 12 0 0 1 36 18a8 8 0 0 1 0 16H14Z" fill="url(#g)"/><circle cx="19" cy="26" r="2.2" fill="#0F1222"/><circle cx="29" cy="26" r="2.2" fill="#0F1222"/></svg>`;
const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;

const CSS = `
:root{--ink:#0F1222;--surface:#161A2E;--card:#1B2036;--line:#2A3150;--text:#EEF0F7;--muted:#9AA3BF;--accent:#8B7CF6;--accent2:#5DD3F0;--ok:#4ADE80;--warn:#FBBF24;--bad:#F87171}
*{box-sizing:border-box}html,body{margin:0;background:var(--ink);color:var(--text);font:15px/1.55 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden;background:radial-gradient(1200px 600px at 20% -10%,#1d2450 0,transparent 60%),var(--ink)}
.blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35}.blob.a{width:520px;height:520px;background:var(--accent);top:-160px;right:-120px}.blob.b{width:420px;height:420px;background:var(--accent2);bottom:-200px;left:-120px;opacity:.2}
.top{display:flex;align-items:center;justify-content:space-between;padding:22px clamp(18px,4vw,48px)}
.brand{display:flex;align-items:center;gap:12px}.brand b{font:600 18px Inter;letter-spacing:.2px;display:block}.brand small{color:var(--muted);font-size:12px}.logo{width:40px;height:40px}
nav{display:flex;gap:10px;align-items:center}.chip{border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:13px;color:var(--muted);background:rgba(255,255,255,.02)}
main{max-width:1120px;margin:0 auto;padding:12px clamp(18px,4vw,48px) 60px}
.hero{max-width:720px;margin:8vh auto 0;text-align:left}.eyebrow{color:var(--accent2);text-transform:uppercase;letter-spacing:.18em;font-size:12px;font-weight:600}
h1{font:400 clamp(40px,6vw,64px)/1.05 'Instrument Serif',Georgia,serif;margin:8px 0 18px}h1 em{font-style:italic;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--muted);font-size:17px;max-width:560px}
.btn{display:inline-flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:12px;padding:11px 18px;font-weight:500;background:var(--card);cursor:pointer;color:var(--text);font-size:14px}
.btn.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;color:#0F1222;font-weight:600}.btn.ghost{background:transparent}.btn.small{padding:7px 12px;font-size:13px}
.muted{color:var(--muted)}.small{font-size:13px}.center{text-align:center}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:18px}
.card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0)),var(--card);border:1px solid var(--line);border-radius:18px;padding:20px 22px}
.card h2{font:400 26px 'Instrument Serif',Georgia,serif;margin:0 0 10px}.card h3{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:0 0 12px;font-weight:600}
.status{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:500}.dot{width:10px;height:10px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 4px rgba(255,255,255,.04);flex:none}.dot.ok{background:var(--ok);box-shadow:0 0 0 4px rgba(74,222,128,.15)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.kpi{font:400 40px/1 'Instrument Serif',Georgia,serif;margin:6px 0 2px}
.bar{height:8px;border-radius:999px;background:var(--surface);overflow:hidden;margin-top:10px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:500}td.num{text-align:right;font-variant-numeric:tabular-nums}
ul.list{list-style:none;padding:0;margin:0}ul.list li{padding:10px 0;border-bottom:1px solid var(--line)}ul.list li:last-child{border:0}.t{font-weight:500}.d{color:var(--muted);font-size:13px}
.brains{display:flex;flex-wrap:wrap;gap:8px}.brain{border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:12px;display:flex;gap:8px;align-items:center;background:var(--surface)}
.span2{grid-column:span 2}@media(max-width:700px){.span2{grid-column:span 1}}
form.inline{display:flex;gap:8px;margin-top:10px}input[type=password],input[type=text]{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px 12px;font:inherit}
pre.rules{white-space:pre-wrap;font:13px/1.5 Inter;color:var(--muted);background:var(--surface);border-radius:12px;padding:12px;max-height:220px;overflow:auto;margin:0}
.foot{text-align:center;color:var(--muted);font-size:12px;padding:30px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--line);padding:10px 16px;border-radius:12px;font-size:13px;display:none}
`;

const JS = `
const $=s=>document.querySelector(s);const shell=$('#shell');
let crmRecords=[],crmColumns=[],crmEditing=null,crmSection='visits';
function closeCrm(){if(crmEditing&&!confirm('¿Cerrar el editor? Los cambios sin guardar se perderán.'))return;crmEditing=null;$('#crm-form').hidden=true}
async function loadCrm(){if(crmEditing){$('#crm-section').value=crmSection;$('#crm-status').textContent='Guarda o cierra el registro antes de cambiar el listado.';return}crmSection=$('#crm-section').value;try{const r=await fetch('/api/crm?section='+crmSection);const j=await r.json();if(!r.ok)throw new Error(j.error);crmRecords=j.records;crmColumns=j.fields;renderCrm();$('#crm-status').textContent=crmRecords.length+' registros en la aplicación · Excel pendiente de sincronización';}catch(e){$('#crm-status').textContent=e.message}}
function renderCrm(){const list=$('#crm-list');list.replaceChildren();const query=$('#crm-search').value.toLocaleLowerCase('es');const rows=crmRecords.filter(r=>Object.values(r.data).join(' ').toLocaleLowerCase('es').includes(query));if(!rows.length){list.textContent='No hay registros que mostrar.';return}const table=document.createElement('table');table.style.width='100%';const head=table.createTHead().insertRow();for(const name of ['Fecha','Delegado',crmSection==='visits'?'Cliente':'Ruta / zona','Estado','']){const th=document.createElement('th');th.textContent=name;head.append(th)}const body=table.createTBody();for(const row of rows){const tr=body.insertRow();for(const key of ['Fecha','Delegado',crmSection==='visits'?'Cliente':'Ruta / zona','Estado'])tr.insertCell().textContent=row.data[key]||'—';const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Editar';button.onclick=()=>editCrm(row);tr.insertCell().append(button)}list.append(table)}
function newCrm(){if(!crmColumns.length){$('#crm-status').textContent='Carga primero el listado.';return}editCrm({id:crypto.randomUUID(),version:0,data:{}})}
function editCrm(row){if(crmEditing&&!confirm('¿Descartar los cambios sin guardar del registro abierto?'))return;crmEditing=row;const fields=$('#crm-fields');fields.replaceChildren();for(const key of crmColumns){const label=document.createElement('label');label.textContent=key;const input=document.createElement(key.includes('Fecha')||key==='Nueva fecha de visita'?'input':'textarea');if(input.tagName==='INPUT')input.type='date';else input.rows=2;input.name=key;input.value=row.data[key]||'';input.maxLength=4000;input.style.width='100%';input.required=['Fecha','Delegado'].includes(key)||(crmSection==='visits'&&key==='Cliente');label.append(input);fields.append(label)}$('#crm-form').hidden=false;$('#crm-editor-title').textContent=row.version?'Editar registro':'Nuevo registro'}
async function saveCrm(e){e.preventDefault();if(!crmEditing)return;const button=e.target.querySelector('button');button.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));const r=await fetch('/api/crm',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:crmEditing.id,version:crmEditing.version,section:crmSection,data})});const j=await r.json();if(!r.ok)throw new Error(j.error);crmEditing=null;$('#crm-form').hidden=true;await loadCrm();$('#crm-status').textContent='Guardado en la aplicación. Pendiente de sincronizar con Excel.';}catch(e){$('#crm-status').textContent=e.message}finally{button.disabled=false}}
async function saveDraft(e){e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await fetch('/api/draft',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({to:$('#draft-to').value,subject:$('#draft-subject').value,body:$('#draft-body').value})});const j=await r.json();if(!r.ok)throw new Error(j.error||'No se pudo guardar');$('#draft-status').textContent='Borrador guardado en Gmail. No se ha enviado.';}catch(e){$('#draft-status').textContent=e.message}finally{button.disabled=false}}
async function uploadKnowledge(e){e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#knowledge-status').textContent='Procesando documento…';try{const file=$('#knowledge-file').files[0];if(!file||file.size>10*1024*1024)throw new Error('Máximo 10 MB por documento');const form=new FormData();form.append('file',file);const r=await fetch('/api/knowledge/upload',{method:'POST',body:form});const j=await r.json();if(!r.ok)throw new Error(j.error||'No se pudo añadir');$('#knowledge-status').textContent='Documento añadido al conocimiento';}catch(e){$('#knowledge-status').textContent=e.message}finally{button.disabled=false}}
let messageCursor=0,readingMessages=false;
function setAccent(value){if(!/^#[0-9a-f]{6}$/i.test(value))return;document.documentElement.style.setProperty('--accent',value);localStorage.setItem('nuvia-accent',value)}
if(localStorage.getItem('nuvia-accent'))setAccent(localStorage.getItem('nuvia-accent'));
function showPanel(name){for(const p of ['dashboard','crm','operative','admin']){const el=$('#panel-'+p);if(el)el.hidden=p!==name}if(name==='operative')readMessages();if(name==='crm')loadCrm()}
async function readMessages(){if(readingMessages||!$('#conversation'))return;readingMessages=true;try{const r=await fetch('/api/conversation?after='+messageCursor);const j=await r.json();if(!r.ok)throw new Error(j.error);for(const m of j.messages){const item=document.createElement('article');item.className='card';const title=document.createElement('strong');title.textContent=(m.role==='user'?'Tú':'Nuvia')+' · '+m.source+' · '+fmtTime(m.created_at);const body=document.createElement('p');body.style.whiteSpace='pre-wrap';body.textContent=m.content;item.append(title,body);$('#conversation').append(item);messageCursor=m.id}if(j.messages.length)$('#conversation').scrollTop=$('#conversation').scrollHeight;}catch(e){$('#chat-status').textContent=e.message}finally{readingMessages=false}}
async function sendWebMessage(e){e.preventDefault();const text=$('#message').value.trim();if(!text)return;$('#send-message').disabled=true;$('#chat-status').textContent='Procesando…';try{const r=await fetch('/api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});const j=await r.json();if(!r.ok)throw new Error(j.error||'No se pudo procesar');$('#message').value='';$('#chat-status').textContent='Procesado. Revisa la respuesta y las confirmaciones pendientes en Telegram.';await readMessages()}catch(e){$('#chat-status').textContent=e.message}finally{$('#send-message').disabled=false}}
setInterval(()=>{if(!document.hidden&&$('#panel-operative')&&!$('#panel-operative').hidden)readMessages()},5000);
async function loadProgramming(){try{const r=await fetch('/api/programming');const j=await r.json();if(!r.ok)throw new Error(j.error);$('#programming').value=j.instructions;$('#programming-status').textContent='Instrucciones cargadas';}catch(e){$('#programming-status').textContent=e.message}}
async function saveProgramming(){if(!confirm('¿Aplicar estas instrucciones al agente?'))return;try{const r=await fetch('/api/programming',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({instructions:$('#programming').value})});const j=await r.json();if(!r.ok)throw new Error(j.error);$('#programming-status').textContent='Instrucciones guardadas';}catch(e){$('#programming-status').textContent=e.message}}
function fmtTime(iso){try{return new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'})}catch(e){return iso||''}}
function toast(m){const t=$('.toast')||document.body.appendChild(Object.assign(document.createElement('div'),{className:'toast'}));t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',3500)}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function load(){if(!shell)return;const r=await fetch('/api/status');if(r.status===401){location.href='/';return}const s=await r.json();render(s)}
function render(s){
 $('#nav').innerHTML='<span class="chip">'+esc(shell.dataset.email)+'</span><a class="btn ghost small" href="/auth/logout">Salir</a>';
 const ok=s.bot.paired&&s.google.connected;const pct=Math.min(100,Math.round(100*s.usage.neurons/s.usage.budget));
 const provName={cf:'Cloudflare',gemini:'Gemini',groq:'Groq',openrouter:'OpenRouter',openai:'OpenAI'};
 shell.innerHTML=
 '<section class="card"><div class="status"><span class="dot '+(ok?'ok':'warn')+'"></span>'+(ok?'Operativo':'Pendiente de conectar')+'<span class="muted small" style="margin-left:auto">'+esc(s.owner.localTime)+' · '+esc(s.owner.tz)+'</span></div>'
 +'<p class="muted" style="margin:10px 0 0">'+esc(s.bot.name)+' atiende a '+esc(s.owner.name)+' por Telegram'+(s.config.dailyBrief?' · parte diario a las '+esc(s.config.dailyBrief):'')+(s.config.quietHours?' · silencio '+esc(s.config.quietHours).replace('-',' a ')+' h':'')+(s.lastActivity?' · última actividad '+fmtTime(s.lastActivity):'')+'</p></section>'
 +'<div class="grid">'
 +card('Telegram',s.bot.paired?'<span class="dot ok"></span>Emparejado':'<span class="dot warn"></span>Sin emparejar','Envía el código de emparejamiento al bot para activarlo.')
 +card('Google',s.google.connected?'<span class="dot ok"></span>'+esc(s.owner.email):(s.google.configured?'<span class="dot warn"></span>Sin autorizar':'<span class="dot bad"></span>Sin configurar'),'Gmail, Calendar, Drive, Docs y Tasks. Se autoriza con /google en Telegram.')
 +'<section class="card"><h3>ChatGPT</h3><div class="status">'+(s.chatgpt.connected?'<span class="dot ok"></span>'+esc(s.chatgpt.email||'Conectado'):'<span class="dot"></span>No conectado')+'</div>'
 +(s.chatgpt.connected?'<p class="d">Tu suscripción de ChatGPT es el cerebro principal del agente. Los gratuitos quedan de respaldo.</p><button class="btn small" onclick="disconnectChatGPT()">Desconectar</button>'
   :'<p class="d">Usa tu cuenta de ChatGPT (Plus, Pro o Business) sin clave de API: te damos un código, lo tecleas en chatgpt.com y listo.</p><div id="gptbox"><button class="btn primary small" onclick="startChatGPT()">Entrar con ChatGPT</button></div>')+'</section>'
 +'<section class="card"><h3>OpenAI (clave de API)</h3><div class="status">'+(s.openai.connected?'<span class="dot ok"></span>Conectado':'<span class="dot"></span>No conectado')+'</div>'
 +(s.openai.fromSecret?'<p class="d">Configurado por el administrador.</p>':(s.openai.connected?'<p class="d">GPT es el cerebro principal; los gratuitos quedan de respaldo.</p><button class="btn small" onclick="disconnectOpenAI()">Desconectar</button>':'<p class="d">Pega tu clave de API de OpenAI (empieza por sk-). Se guarda cifrada y nadie más la ve.</p><form class="inline" onsubmit="return connectOpenAI(event)"><input type="password" id="oak" placeholder="sk-…" autocomplete="off"><button class="btn primary small">Conectar</button></form>'))+'</section>'
 +'<section class="card"><h3>Uso de IA hoy</h3><div class="kpi">'+s.usage.neurons.toLocaleString('es-ES')+'</div><div class="d">de '+s.usage.budget.toLocaleString('es-ES')+' neuronas gratuitas de Cloudflare</div><div class="bar"><i style="width:'+pct+'%"></i></div></section>'
 +'</div><div class="grid">'
 +'<section class="card span2"><h3>Cerebros (orden de preferencia)</h3><div class="brains">'+s.brains.map(b=>'<span class="brain"><span class="dot '+(b.configured?'ok':'')+'"></span>'+esc(provName[b.provider]||b.provider)+' · '+esc(b.model)+'</span>').join('')+'</div>'
 +'<p class="d" style="margin-top:10px">Si uno falla o agota su cuota, el siguiente toma el relevo. <button class="btn ghost small" onclick="probe()">Probar ahora</button> <span id="probe" class="d"></span></p>'
 +(s.usage.rows.length?'<table style="margin-top:12px"><tr><th>Modelo</th><th class="num">Llamadas</th><th class="num">Tokens</th><th class="num">Errores</th></tr>'+s.usage.rows.map(r=>'<tr><td>'+esc(provName[r.provider]||r.provider)+' · '+esc(r.model)+'</td><td class="num">'+r.calls+'</td><td class="num">'+(r.input_tokens+r.output_tokens).toLocaleString('es-ES')+'</td><td class="num '+(r.errors?'warn':'')+'">'+r.errors+'</td></tr>').join('')+'</table>':'')
 +'</section>'
 +'<section class="card"><h3>Memoria y conocimiento</h3><div class="kpi">'+s.knowledge.count+'</div><div class="d">documentos indexados · '+s.memory.count+' recuerdos</div>'
 +(s.knowledge.recent.length?'<ul class="list" style="margin-top:12px">'+s.knowledge.recent.map(d=>'<li><div class="t">'+esc(d.title)+'</div><div class="d">'+d.date+' · '+d.chunks+' fragmentos · '+esc(d.summary)+'</div></li>').join('')+'</ul>':'<p class="d">Envía archivos o enlaces al bot y aparecerán aquí.</p>')+'</section>'
 +'</div><div class="grid">'
 +'<section class="card"><h3>Herramientas creadas por el agente</h3>'+(s.tools.length?'<ul class="list">'+s.tools.map(t=>'<li><div class="t">'+esc(t.name)+' <span class="d">v'+t.version+' · '+t.uses+' usos</span></div><div class="d">'+esc(t.description)+'</div></li>').join('')+'</ul>':'<p class="d">Ninguna todavía. Cuando le pidas algo sin herramienta, la buscará y se la creará.</p>')
 +'<p class="d" style="margin-top:10px">Credenciales en el baúl: '+(s.secrets.length?s.secrets.map(esc).join(', '):'ninguna')+'</p></section>'
 +'<section class="card"><h3>Actividad reciente</h3>'+(s.audit.length?'<ul class="list">'+s.audit.map(a=>'<li><div class="t">'+esc(a.action)+(a.confirmed?' <span class="ok small">✓ confirmado</span>':'')+'</div><div class="d">'+fmtTime(a.at)+' · '+esc(a.detail)+'</div></li>').join('')+'</ul>':'<p class="d">Sin acciones registradas.</p>')+'</section>'
 +'<section class="card"><h3>Instrucciones que se ha dado a sí mismo</h3>'+(s.selfPrompt?'<pre class="rules">'+esc(s.selfPrompt)+'</pre>':'<p class="d">Todavía ninguna. Se ven también con /instrucciones en Telegram.</p>')+'</section>'
 +'</div>';
}
function card(t,st,d){return '<section class="card"><h3>'+t+'</h3><div class="status">'+st+'</div><p class="d">'+d+'</p></section>'}
async function connectOpenAI(e){e.preventDefault();const key=$('#oak').value;const r=await fetch('/api/openai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});const j=await r.json();toast(j.ok?'OpenAI conectado ('+j.models+' modelos disponibles)':j.error||'No se pudo conectar');if(j.ok)load();return false}
let gptTimer=null;
async function startChatGPT(){const box=$('#gptbox');box.innerHTML='<p class="d">Pidiendo código…</p>';const r=await fetch('/api/chatgpt/start',{method:'POST'});const j=await r.json();if(!j.ok){box.innerHTML='<p class="bad small">'+esc(j.error||'No se pudo iniciar')+'</p><button class="btn small" onclick="startChatGPT()">Reintentar</button>';return}
 box.innerHTML='<p class="d">1. Abre <a class="ok" href="'+esc(j.verification_url)+'" target="_blank" rel="noopener">'+esc(j.verification_url)+'</a> e inicia sesión en ChatGPT.<br>2. Teclea este código:</p><div class="kpi" style="letter-spacing:.12em">'+esc(j.user_code)+'</div><p class="d" id="gptstate">Esperando a que autorices… (el código caduca en 15 min)</p>';
 clearInterval(gptTimer);gptTimer=setInterval(async()=>{const p=await fetch('/api/chatgpt/poll',{method:'POST'});const s=await p.json();const st=$('#gptstate');if(s.status==='connected'){clearInterval(gptTimer);toast('ChatGPT conectado'+(s.email?' como '+s.email:''));load()}else if(s.status==='expired'||s.status==='none'){clearInterval(gptTimer);if(st)st.innerHTML='<span class="warn">El código ha caducado.</span> <button class="btn small" onclick="startChatGPT()">Pedir otro</button>'}else if(s.error&&st){st.textContent='Esperando… ('+s.error+')'}},Math.max(3,(j.interval||5))*1000)}
async function disconnectChatGPT(){if(!confirm('¿Desconectar ChatGPT? El agente seguirá con los cerebros gratuitos.'))return;await fetch('/api/chatgpt/disconnect',{method:'POST'});toast('ChatGPT desconectado');load()}
async function disconnectOpenAI(){if(!confirm('¿Desconectar OpenAI? El agente seguirá con los cerebros gratuitos.'))return;await fetch('/api/openai',{method:'DELETE'});toast('OpenAI desconectado');load()}
async function probe(){$('#probe').textContent='probando…';const r=await fetch('/api/probe',{method:'POST'});const j=await r.json();$('#probe').innerHTML=(j.results||[]).map(x=>'<span class="'+(x.ok?'ok':'bad')+'">'+esc(x.model.split('/').pop())+' '+(x.ok?x.ms+' ms':'falla')+'</span>').join(' · ')}
setInterval(()=>{const c=$('#clock');if(c)c.textContent=new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})},1000);
load();
`;
