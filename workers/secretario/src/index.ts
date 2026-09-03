import { getSetting, setSetting } from './db';
import type { Env } from './env';
import { oauthExchange } from './google';
import { send, tg } from './telegram';
import { SecretarioSession } from './session';

export { SecretarioSession };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function adminOk(req: Request, env: Env): boolean {
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const q = new URL(req.url).searchParams.get('token') ?? '';
  const t = (auth || q).trim();
  return Boolean(env.ADMIN_TOKEN && t && t === env.ADMIN_TOKEN);
}

async function ownerChatId(env: Env): Promise<string | null> {
  return env.OWNER_CHAT_ID || (await getSetting(env, 'owner_chat_id'));
}

function sessionFor(env: Env, chatId: string): DurableObjectStub {
  return env.SESSION.get(env.SESSION.idFromName(`chat:${chatId}`));
}

async function handleTelegram(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  const update = await req.json<any>();
  const msg = update.message ?? update.callback_query?.message;
  const from = update.message?.from ?? update.callback_query?.from;
  if (!msg?.chat?.id) return json({ ok: true, ignored: true });
  const chatId = String(msg.chat.id);
  const fromId = String(from?.id ?? chatId);
  const owner = await ownerChatId(env);

  if (!owner) {
    // Emparejamiento: el primer chat que envíe el código queda como dueño.
    const text = String(update.message?.text ?? '').trim();
    if (env.PAIRING_CODE && text === env.PAIRING_CODE) {
      await setSetting(env, 'owner_chat_id', chatId);
      await send(env, chatId, `Emparejado. A partir de ahora solo respondo en este chat. Escribe /ayuda para empezar.`, { plain: true });
    } else if (text.startsWith('/start')) {
      await send(env, chatId, 'Este bot es privado. Envía el código de emparejamiento para activarlo.', { plain: true });
    }
    return json({ ok: true });
  }
  if (chatId !== owner && fromId !== owner) {
    // Mensajes ajenos: se ignoran en silencio (como recomienda OpenClaw: entrada no confiable).
    console.log(`mensaje ignorado de chat ${chatId}`);
    return json({ ok: true, ignored: true });
  }
  ctx.waitUntil(
    sessionFor(env, owner)
      .fetch('https://session/update', { method: 'POST', body: JSON.stringify(update), headers: { 'content-type': 'application/json' } })
      .catch((e) => console.error('session fetch', e)),
  );
  return json({ ok: true });
}

async function setupWebhook(env: Env): Promise<unknown> {
  if (!env.PUBLIC_URL) throw new Error('Falta PUBLIC_URL');
  const r = await tg(env, 'setWebhook', {
    url: `${env.PUBLIC_URL}/telegram/webhook`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  await tg(env, 'setMyCommands', {
    commands: [
      { command: 'ayuda', description: 'Qué sé hacer' },
      { command: 'estado', description: 'Uso de hoy y salud' },
      { command: 'memoria', description: 'Qué recuerdo' },
      { command: 'aprende', description: 'Guardar un hecho' },
      { command: 'skills', description: 'Habilidades aprendidas' },
      { command: 'tareas', description: 'Tareas programadas' },
      { command: 'feedback', description: 'Corrígeme' },
      { command: 'modo', description: 'silencio o normal' },
      { command: 'nuevo', description: 'Conversación limpia' },
      { command: 'google', description: 'Conectar Google' },
    ],
  }).catch(() => undefined);
  return r;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === 'POST' && url.pathname === '/telegram/webhook') return await handleTelegram(req, env, ctx);
      if (url.pathname === '/health') {
        const owner = await ownerChatId(env);
        return json({ ok: true, service: env.BOT_NAME || 'Secretario', paired: Boolean(owner), time: new Date().toISOString() });
      }
      if (req.method === 'POST' && url.pathname === '/admin/setup-webhook') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        return json({ ok: true, result: await setupWebhook(env) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/heartbeat') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const owner = await ownerChatId(env);
        if (!owner) return json({ ok: false, error: 'sin emparejar' });
        await sessionFor(env, owner).fetch('https://session/heartbeat', { method: 'POST' });
        return json({ ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const saved = JSON.parse((await getSetting(env, 'oauth_state')) || 'null') as { token: string; chatId: string; exp: number } | null;
        if (!code || !state || !saved || saved.token !== state || saved.exp < Date.now()) return new Response('Enlace inválido o caducado. Pide otro con /google en Telegram.', { status: 400 });
        await oauthExchange(env, code);
        await setSetting(env, 'oauth_state', 'null');
        await send(env, saved.chatId, `Google conectado para ${env.OWNER_EMAIL}. Ya puedo trabajar con tu correo, agenda y Drive.`, { plain: true }).catch(() => undefined);
        return new Response('Google conectado. Puedes cerrar esta pestaña y volver a Telegram.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return new Response('Secretario en marcha.', { status: 200 });
    } catch (e: any) {
      console.error(e);
      return json({ ok: false, error: String(e?.message ?? e) }, 500);
    }
  },

  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const owner = await ownerChatId(env);
    if (!owner) return;
    ctx.waitUntil(sessionFor(env, owner).fetch('https://session/heartbeat', { method: 'POST' }).catch((e) => console.error('heartbeat', e)));
  },
};
