import { getSetting, setSetting } from './db';
import type { Env } from './env';
import { oauthExchange, gmailDraft } from './google';
import { buildAgenda, renderAgenda } from './agenda';
import { runAgent } from './agent';
import { extractText, forgetDocument, ingestDocument, ingestUrl, listDocuments, searchKnowledge } from './knowledge';
import { reindexMemories } from './memory';
import { ask, chat, forgetChatGPTCache, listModels, probeProviders } from './router';
import { chatgptDisconnect, lastRawSse, pollDeviceLogin, startDeviceLogin } from './chatgpt';
import { audit } from './db';
import { clip, resolveDay, safeJson, uid } from './util';
import { appShell, connectOpenAI, disconnectOpenAI, landing, legalPage, loginCallback, loginRedirect, logout, page, probeJson, sessionEmail, statusJson } from './dashboard';
import { send, tg } from './telegram';
import { SecretarioSession } from './session';
import { proposeAccompaniments, type PlanningInput } from './planning';
import { decideProposal, listProposals, saveProposal } from './planningStore';
import { crmApi, importCrmExcel, syncCrmExcel } from './crm';
import { transcribe } from './media';
import { salesDashboardApi } from './salesDashboard';

export { SecretarioSession };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

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
      // ---------- Panel web ----------
      if (req.method === 'GET' && url.pathname === '/') {
        const email = await sessionEmail(req, env);
        return page(env, email ? appShell(email) : landing(env));
      }
      if (req.method === 'GET' && (url.pathname === '/privacidad' || url.pathname === '/condiciones')) return page(env, legalPage(env, url.pathname.slice(1) as 'privacidad' | 'condiciones'));
      if (req.method === 'GET' && url.pathname === '/auth/google') {
        if (!env.GOOGLE_CLIENT_ID || !env.PUBLIC_URL) return page(env, '<section class="card center"><h2>Panel sin configurar</h2><p class="muted">Faltan las credenciales de Google del Worker.</p></section>', 500);
        return loginRedirect(env, uid('st_'));
      }
      if (req.method === 'GET' && url.pathname === '/auth/google/callback') return loginCallback(req, env);
      if (url.pathname === '/auth/logout') return logout();
      if (url.pathname.startsWith('/api/')) {
        const email = await sessionEmail(req, env);
        if (!email && !adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        if (email && !['GET', 'HEAD'].includes(req.method) && req.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Origen no permitido' }, 403);
        if (url.pathname === '/api/crm') {
          if (!email) return json({error:'Inicia sesión con Google.'},401);
          return crmApi(req,env,email);
        }
        if (url.pathname === '/api/crm/import' && req.method === 'POST') {
          if (!email || email.toLowerCase() !== env.OWNER_EMAIL?.toLowerCase()) return json({error:'Solo la propietaria puede importar el CRM.'},403);
          try { return json({ok:true,result:await importCrmExcel(env,email)}); }
          catch(e){return json({ok:false,error:e instanceof Error?e.message:'No se pudo importar el Excel'},409);}
        }
        if (url.pathname === '/api/crm/sync' && req.method === 'POST') {
          if (!email || email.toLowerCase() !== env.OWNER_EMAIL?.toLowerCase()) return json({error:'Solo la propietaria puede sincronizar el CRM.'},403);
          try { return json({ok:true,result:await syncCrmExcel(env)}); }
          catch(e){return json({ok:false,error:e instanceof Error?e.message:'No se pudo sincronizar el Excel'},409);}
        }
        if (url.pathname === '/api/sales-dashboard') {
          if (!email) return json({error:'Inicia sesión con Google.'},401);
          return salesDashboardApi(req,env,email);
        }
        if (url.pathname === '/api/draft' && req.method === 'POST') {
          const b = await req.json<{ to?: string; subject?: string; body?: string }>();
          if (typeof b.subject !== 'string' || typeof b.body !== 'string' || b.body.length > 50000 || /[\r\n]/.test(b.subject) || (b.to && /[\r\n]/.test(b.to))) return json({ ok: false, error: 'Revisa el asunto y el cuerpo del borrador.' }, 400);
          const draft = await gmailDraft(env, b.to || '', b.subject, b.body);
          await audit(env, null, 'panel_draft', { email, draftId: draft.id });
          return json({ ok: true, draft });
        }
        if (url.pathname === '/api/draft/generate' && req.method === 'POST') {
          if (!email) return json({error:'Inicia sesión con Google.'},401);
          const form=await req.formData(),idea=String(form.get('idea')||'').trim(),file=form.get('file');
          if(!idea||idea.length>12000)return json({error:'Escribe una idea de hasta 12.000 caracteres.'},400);
          let source='';let fileName='';
          if(file&&typeof file!=='string'){
            if(file.size>20*1024*1024)return json({error:'El archivo de apoyo no puede superar 20 MB.'},400);
            fileName=file.name;source=(await extractText(env,file.name,file.type,await file.arrayBuffer())).text;
          }
          const raw=await ask(env,'fast','Redactas correos profesionales en español de España para Araceli Delgado, Área Manager farmacéutica. Devuelve exclusivamente JSON válido con esta forma: {"subject":"asunto breve","body":"correo completo"}. Mantén un tono cercano, claro y profesional. No inventes datos. El cuerpo debe estar listo para enviar y no debe incluir el asunto.',`Idea de Araceli:\n${idea}${source?`\n\nArchivo de apoyo (${fileName}):\n${clip(source,16000)}`:''}`,1400);
          const draft=safeJson<{subject?:string;body?:string}>(raw,{});const subject=String(draft.subject||'').replace(/[\r\n]+/g,' ').trim(),body=String(draft.body||'').trim();
          if(!subject||!body)return json({error:'No se ha podido estructurar el borrador. Vuelve a intentarlo.'},502);
          await audit(env,null,'panel_draft_generate',{email,file:fileName||null,ideaCharacters:idea.length});
          return json({ok:true,subject,body,fileName:fileName||null});
        }
        if (url.pathname === '/api/transcribe' && req.method === 'POST') {
          if (!email) return json({error:'Inicia sesión con Google.'},401);
          const form=await req.formData();const file=form.get('file');
          if(!file||typeof file==='string'||file.size>25*1024*1024||!/^audio\//.test(file.type))return json({error:'Adjunta un audio de hasta 25 MB.'},400);
          const result=await transcribe(env,await file.arrayBuffer(),'Nota de voz profesional en español de España. Conserva nombres propios, farmacias, rutas, fechas y tareas.');
          return json({ok:true,...result});
        }
        if(url.pathname==='/api/preferences'){
          if(!email)return json({error:'Inicia sesión con Google.'},401);
          if(req.method==='GET'){const p=await env.DB.prepare('SELECT accent FROM user_preferences WHERE email=?').bind(email).first<{accent:string}>();return json({ok:true,accent:p?.accent||'#8b7cf6'});}
          if(req.method==='PUT'){const b=await req.json<{accent?:string}>();if(!/^#[0-9a-f]{6}$/i.test(b.accent||''))return json({error:'Color inválido'},400);await env.DB.prepare('INSERT INTO user_preferences(email,accent,updated_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET accent=excluded.accent,updated_at=excluded.updated_at').bind(email,b.accent,new Date().toISOString()).run();return json({ok:true});}
        }
        if (url.pathname === '/api/knowledge/upload' && req.method === 'POST') {
          const form = await req.formData();
          const file = form.get('file');
          if (!file || typeof file === 'string' || file.size > 20 * 1024 * 1024) return json({ ok: false, error: 'Adjunta un documento de hasta 20 MB.' }, 400);
          const extracted = await extractText(env, file.name, file.type, await file.arrayBuffer());
          if (!extracted.text.trim()) return json({ ok: false, error: 'No se ha podido extraer texto del documento.' }, 400);
          const document = await ingestDocument(env, { title: file.name, text: extracted.text, source: 'web', mime: file.type });
          return json({ ok: true, document });
        }
        if (url.pathname === '/api/knowledge/text' && req.method === 'POST') {
          if(!email)return json({error:'Inicia sesión con Google.'},401);
          const body=await req.json<{title?:unknown;text?:unknown}>();
          if(typeof body.title!=='string'||typeof body.text!=='string'||!body.title.trim()||!body.text.trim()||body.title.length>200||body.text.length>100000)return json({error:'Escribe un título y un contenido de hasta 100.000 caracteres.'},400);
          const document=await ingestDocument(env,{title:body.title.trim(),text:body.text.trim(),source:'web-text',mime:'text/plain'});
          await audit(env,null,'panel_knowledge_text',{email,documentId:document.id,characters:body.text.length});
          return json({ok:true,document});
        }
        if (url.pathname === '/api/planning/preview' && req.method === 'POST') {
          try { return json({ ok: true, proposal: proposeAccompaniments(await req.json<PlanningInput>()) }); }
          catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'Planificación inválida' }, 400); }
        }
        if (url.pathname === '/api/planning/proposals') {
          if (!email) return json({ ok: false, error: 'Inicia sesión con Google.' }, 401);
          if (req.method === 'GET') return json({ ok: true, proposals: await listProposals(env) });
          if (req.method === 'POST') {
            try { return json({ ok: true, proposal: await saveProposal(env, await req.json<PlanningInput>(), email) }); }
            catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'Propuesta inválida' }, 400); }
          }
        }
        if (url.pathname === '/api/planning/decision' && req.method === 'POST') {
          if (!email || email.toLowerCase() !== env.OWNER_EMAIL?.toLowerCase()) return json({ ok: false, error: 'Solo la propietaria puede decidir su planificación.' }, 403);
          const b = await req.json<{ id?: string; decision?: string }>();
          if (typeof b.id !== 'string' || !['approved','cancelled'].includes(b.decision || '')) return json({ ok: false, error: 'Decisión inválida' }, 400);
          try { return json({ ok: true, result: await decideProposal(env, b.id, b.decision as 'approved' | 'cancelled', email) }); }
          catch (e) { return json({ ok: false, error: e instanceof Error ? e.message : 'No se pudo decidir la propuesta' }, 409); }
        }
        if (url.pathname === '/api/conversation') {
          const chatId = await ownerChatId(env);
          if (!chatId) return json({ ok: false, error: 'Conecta primero Telegram con /start.' }, 409);
          if (req.method === 'GET') {
            const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
            const messages = await env.DB.prepare('SELECT id,role,source,content,created_at FROM conversation_messages WHERE chat_id=? AND id>? ORDER BY id LIMIT 100').bind(chatId, after).all();
            return json({ ok: true, messages: messages.results });
          }
          if (req.method === 'POST') {
            const b = await req.json<{ text: string }>();
            return sessionFor(env, chatId).fetch(new Request('https://session/web-message', { method: 'POST', body: JSON.stringify({ chatId, text: b.text }) }));
          }
        }
        if (url.pathname === '/api/programming') {
          if (email?.toLowerCase() !== 'info@apdsport.com') return json({ ok: false, error: 'Solo el administrador puede programar el agente.' }, 403);
          if (req.method === 'GET') return json({ ok: true, instructions: await getSetting(env, 'admin_prompt') || '' });
          if (req.method === 'PUT') {
            if (req.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Origen no permitido' }, 403);
            const body = await req.json<{ instructions?: unknown }>();
            if (typeof body.instructions !== 'string' || body.instructions.length > 20000) return json({ ok: false, error: 'Las instrucciones deben ser texto de hasta 20.000 caracteres.' }, 400);
            await setSetting(env, 'admin_prompt', body.instructions);
            await audit(env, null, 'panel_programming', { email, characters: body.instructions.length }, true);
            return json({ ok: true });
          }
          return json({ ok: false, error: 'Método no permitido' }, 405);
        }
        if (req.method === 'GET' && url.pathname === '/api/status') return json({ ok: true, ...(await statusJson(env)) });
        if (req.method === 'POST' && url.pathname === '/api/openai') {
          const b = await req.json<{ key?: string }>();
          return json(await connectOpenAI(env, String(b.key || '')));
        }
        if (req.method === 'DELETE' && url.pathname === '/api/openai') {
          await disconnectOpenAI(env);
          return json({ ok: true });
        }
        if (req.method === 'POST' && url.pathname === '/api/probe') return json({ ok: true, results: await probeJson(env) });
        if (req.method === 'POST' && url.pathname === '/api/chatgpt/start') {
          try {
            return json({ ok: true, ...(await startDeviceLogin(env)) });
          } catch (e: any) {
            return json({ ok: false, error: String(e?.message ?? e) });
          }
        }
        if (req.method === 'POST' && url.pathname === '/api/chatgpt/poll') {
          const r = await pollDeviceLogin(env);
          if (r.status === 'connected') {
            forgetChatGPTCache();
            await audit(env, null, 'chatgpt_connect', { email: r.email });
          }
          return json({ ok: true, ...r });
        }
        if (req.method === 'POST' && url.pathname === '/api/chatgpt/disconnect') {
          await chatgptDisconnect(env);
          forgetChatGPTCache();
          return json({ ok: true });
        }
        return json({ ok: false, error: 'not found' }, 404);
      }
      if (url.pathname === '/health') {
        const owner = await ownerChatId(env);
        return json({ ok: true, service: env.BOT_NAME || 'Secretario', paired: Boolean(owner), time: new Date().toISOString() });
      }
      if (req.method === 'POST' && url.pathname === '/admin/setup-webhook') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        return json({ ok: true, result: await setupWebhook(env) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/probe') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const tier = url.searchParams.get('tier') === 'fast' ? 'fast' : 'smart';
        return json({ ok: true, tier, results: await probeProviders(env, tier, url.searchParams.get('chain') || undefined) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/models') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const p = url.searchParams.get('provider');
        if (p !== 'gemini' && p !== 'groq' && p !== 'openrouter' && p !== 'openai') return json({ ok: false, error: 'provider debe ser gemini, groq, openrouter u openai' }, 400);
        return json({ ok: true, provider: p, models: await listModels(env, p) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/ask') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const b = await req.json<{ text: string; system?: string; tier?: 'smart' | 'fast'; only?: string }>();
        const r = await chat(env, b.tier ?? 'smart', [{ role: 'system', content: b.system ?? 'Eres un asistente. Responde en español.' }, { role: 'user', content: b.text }], [], 600, b.only);
        return json({ ok: true, provider: r.provider, model: r.model, content: r.content });
      }
      if (req.method === 'POST' && url.pathname === '/admin/reindex') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        return json({ ok: true, memories: await reindexMemories(env) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/knowledge') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const b = await req.json<{ action: 'url' | 'text' | 'search' | 'list' | 'forget'; url?: string; title?: string; text?: string; query?: string }>();
        if (b.action === 'url') return json({ ok: true, doc: await ingestUrl(env, String(b.url), b.title) });
        if (b.action === 'text') return json({ ok: true, doc: await ingestDocument(env, { title: String(b.title || 'texto'), text: String(b.text || ''), source: 'admin' }) });
        if (b.action === 'search') return json({ ok: true, hits: await searchKnowledge(env, String(b.query || ''), 6) });
        if (b.action === 'forget') return json({ ok: true, forgotten: await forgetDocument(env, String(b.url || '')) });
        return json({ ok: true, docs: await listDocuments(env, 50) });
      }
      if (req.method === 'POST' && url.pathname === '/admin/agent') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const b = await req.json<{ text: string; tier?: 'smart' | 'fast' }>();
        const sent: string[] = [];
        const r = await runAgent(env, {
          chatId: 'admin-test',
          tz: env.TIMEZONE || 'Europe/Madrid',
          history: [{ role: 'user', content: b.text }],
          summary: '',
          tier: b.tier,
          onTasksChanged: async () => undefined,
          sendFile: async (name) => void sent.push(`archivo:${name}`),
          sendText: async (text) => void sent.push(text),
        });
        return json({ ok: true, provider: r.provider, toolsUsed: r.toolsUsed, sent, text: r.text, messages: r.messages });
      }
      if (req.method === 'POST' && url.pathname === '/admin/chatgpt-raw') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const b = await req.json<{ text: string }>();
        let error = '';
        try {
          await chat(env, 'smart', [{ role: 'user', content: b.text }], [], 300, 'chatgpt');
        } catch (e: any) {
          error = String(e?.message ?? e);
        }
        return new Response(`error: ${error}\n\n${lastRawSse}`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      if (req.method === 'POST' && url.pathname === '/admin/agenda') {
        if (!adminOk(req, env)) return json({ ok: false, error: 'unauthorized' }, 401);
        const tz = env.TIMEZONE || 'Europe/Madrid';
        const day = resolveDay(url.searchParams.get('date') || 'hoy', tz);
        if (!day) return json({ ok: false, error: 'fecha no reconocida' }, 400);
        const ag = await buildAgenda(env, tz, day, Number(url.searchParams.get('days')) || 1);
        const rendered = renderAgenda(ag, tz);
        let sentTo: string | null = null;
        if (url.searchParams.get('send') === '1') {
          const owner = await ownerChatId(env);
          if (owner) {
            await send(env, owner, rendered);
            sentTo = owner;
          }
        }
        return json({ ok: true, sentTo, rendered, agenda: ag });
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
