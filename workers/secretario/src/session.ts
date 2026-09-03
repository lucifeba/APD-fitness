import { learn, runAgent, summarize } from './agent';
import { audit, getSetting, setSetting, usageSummary } from './db';
import type { ChatMessage, Env, Incoming, PendingAction } from './env';
import { googleConfigured, oauthStartUrl } from './google';
import { heartbeat } from './heartbeat';
import { describeImage, transcribe } from './media';
import { countMemories, listMemories, remember } from './memory';
import { getTool } from './tools';
import type { ToolCtx } from './tools/types';
import { answerCallback, clearKeyboard, downloadFile, send, sendDocument, typing } from './telegram';
import { clip, inQuietHours, localTime, nextCron, now, uid } from './util';

interface State {
  history: ChatMessage[];
  summary: string;
  pending: Record<string, PendingAction>;
  mode: 'normal' | 'silencio';
  lastActivity: string;
}

const MAX_HISTORY = 24;
const KEEP_AFTER_SUMMARY = 10;

export class SecretarioSession implements DurableObject {
  private state!: State;
  private loaded = false;
  /** Cola para procesar los mensajes de uno en uno y no mezclar respuestas. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private ctx: DurableObjectState, private env: Env) {}

  private async load(): Promise<State> {
    if (!this.loaded) {
      this.state = (await this.ctx.storage.get<State>('state')) ?? { history: [], summary: '', pending: {}, mode: 'normal', lastActivity: now() };
      this.loaded = true;
    }
    return this.state;
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('state', this.state);
  }

  private get tz(): string {
    return this.env.TIMEZONE || 'Europe/Madrid';
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.load();
    try {
      if (url.pathname === '/update') {
        // Respondemos enseguida a Telegram y procesamos en segundo plano dentro del objeto.
        const update = await request.json<any>();
        this.queue = this.queue.then(() => this.handleUpdate(update)).catch((e) => console.error('update', e));
        this.ctx.waitUntil(this.queue);
      } else if (url.pathname === '/heartbeat') {
        await this.runHeartbeat();
      } else if (url.pathname === '/reschedule') {
        await this.rescheduleAlarm();
      } else if (url.pathname === '/notify') {
        const { chatId, text } = await request.json<{ chatId: string; text: string }>();
        await send(this.env, chatId, text);
      }
      return new Response('ok');
    } catch (e: any) {
      console.error('session error', e);
      return new Response(String(e?.message ?? e), { status: 500 });
    }
  }

  // ---------- Telegram ----------

  private async handleUpdate(update: any): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const msg = update.message;
    if (!msg) return;
    const chatId = String(msg.chat.id);
    const text: string = msg.text ?? msg.caption ?? '';
    if (text.startsWith('/')) {
      if (await this.handleCommand(chatId, text, msg.message_id)) return;
    }
    await typing(this.env, chatId);
    const incoming = await this.buildIncoming(chatId, msg);
    if (!incoming.text.trim()) {
      await send(this.env, chatId, 'No he podido extraer contenido de ese mensaje.');
      return;
    }
    await this.converse(chatId, incoming);
  }

  private async buildIncoming(chatId: string, msg: any): Promise<Incoming> {
    const parts: string[] = [];
    let kind: Incoming['kind'] = 'text';
    if (msg.text) parts.push(msg.text);
    if (msg.caption) parts.push(msg.caption);
    const media = msg.voice ?? msg.audio ?? msg.video_note;
    if (media) {
      kind = 'voice';
      try {
        const { bytes } = await downloadFile(this.env, media.file_id);
        const t = await transcribe(this.env, bytes);
        parts.push(`[Nota de voz transcrita, ${Math.round(t.seconds)} s]: ${t.text || '(no se entendió nada)'}`);
      } catch (e: any) {
        parts.push(`[No pude transcribir el audio: ${e.message}]`);
      }
    }
    if (msg.photo?.length) {
      kind = 'photo';
      const sizes = [...msg.photo].sort((a: any, b: any) => a.width - b.width);
      const pick = sizes.find((p: any) => p.width >= 640 && (p.file_size ?? 0) < 900_000) ?? sizes[Math.min(sizes.length - 1, 1)];
      try {
        const { bytes } = await downloadFile(this.env, pick.file_id);
        const d = await describeImage(this.env, bytes, msg.caption ? `El usuario dice: "${msg.caption}". Describe la imagen con detalle y transcribe cualquier texto.` : '');
        parts.push(`[Imagen enviada. Descripción automática]: ${d}`);
      } catch (e: any) {
        parts.push(`[No pude analizar la imagen: ${e.message}]`);
      }
    }
    if (msg.document) {
      kind = 'document';
      const d = msg.document;
      const textLike = /^text\/|json|csv|xml|markdown/i.test(d.mime_type ?? '') || /\.(txt|md|csv|json|xml|log|ts|js|py|html)$/i.test(d.file_name ?? '');
      if (textLike && (d.file_size ?? 0) < 900_000) {
        try {
          const { bytes } = await downloadFile(this.env, d.file_id);
          parts.push(`[Archivo ${d.file_name}]:\n${clip(new TextDecoder().decode(bytes), 20000)}`);
        } catch (e: any) {
          parts.push(`[No pude leer el archivo ${d.file_name}: ${e.message}]`);
        }
      } else parts.push(`[Archivo adjunto: ${d.file_name} (${d.mime_type}, ${Math.round((d.file_size ?? 0) / 1024)} KB). No puedo leer este formato directamente.]`);
    }
    if (msg.location) parts.push(`[Ubicación: ${msg.location.latitude}, ${msg.location.longitude}]`);
    if (msg.contact) parts.push(`[Contacto: ${msg.contact.first_name ?? ''} ${msg.contact.last_name ?? ''} ${msg.contact.phone_number ?? ''}]`);
    let replyTo: Incoming['replyTo'];
    const r = msg.reply_to_message;
    if (r) {
      const quoted = r.text ?? r.caption ?? (r.voice ? '(nota de voz)' : r.photo ? '(imagen)' : r.document ? `(archivo ${r.document.file_name})` : '');
      replyTo = { text: clip(quoted, 1500), fromBot: Boolean(r.from?.is_bot) };
    }
    return { chatId, messageId: msg.message_id, text: parts.join('\n'), kind, replyTo };
  }

  private async converse(chatId: string, incoming: Incoming): Promise<void> {
    const state = await this.load();
    let userText = incoming.text;
    if (incoming.replyTo) userText = `[Respondiendo a ${incoming.replyTo.fromBot ? 'tu mensaje' : 'un mensaje'}: "${incoming.replyTo.text}"]\n${userText}`;
    state.history.push({ role: 'user', content: userText });
    state.lastActivity = now();
    const typingLoop = setInterval(() => void typing(this.env, chatId), 4500);
    try {
      const result = await runAgent(this.env, {
        chatId,
        tz: this.tz,
        history: state.history,
        summary: state.summary,
        onTasksChanged: () => this.rescheduleAlarm(),
        sendFile: (name, content, caption) => sendDocument(this.env, chatId, name, content, caption),
      });
      clearInterval(typingLoop);
      // Guardamos solo lo que aporta contexto: el texto final del asistente (las llamadas a herramientas se resumen).
      const used = result.toolsUsed.length ? `\n[herramientas usadas: ${[...new Set(result.toolsUsed)].join(', ')}]` : '';
      state.history.push({ role: 'assistant', content: `${result.text}${used}` });
      for (const p of result.pending) state.pending[p.id] = p;
      const keyboard = result.pending.map((p) => [
        { text: `✅ Confirmar: ${clip(p.summary.split('\n')[0], 28)}`, data: `ok:${p.id}` },
        { text: '❌ Cancelar', data: `no:${p.id}` },
      ]);
      await send(this.env, chatId, result.text || '(sin respuesta)', { replyTo: incoming.messageId, keyboard: keyboard.length ? keyboard : undefined });
      await this.compactHistory();
      await this.save();
      const lastUser = incoming.text;
      this.ctx.waitUntil(
        learn(this.env, lastUser, result.text)
          .then((n) => n && console.log(`aprendidos ${n} hechos`))
          .catch((e) => console.warn('learn', e?.message)),
      );
    } catch (e: any) {
      clearInterval(typingLoop);
      state.history.pop();
      await this.save();
      await send(this.env, chatId, `Se me ha atragantado esto: ${clip(String(e?.message ?? e), 600)}\n\nPrueba otra vez o reformula.`, { plain: true });
    }
  }

  private async compactHistory(): Promise<void> {
    const state = this.state;
    if (state.history.length <= MAX_HISTORY) return;
    const old = state.history.slice(0, state.history.length - KEEP_AFTER_SUMMARY);
    try {
      state.summary = await summarize(this.env, state.summary, old);
      await this.env.DB.prepare('INSERT INTO episodes(chat_id,day,summary,created_at) VALUES(?,?,?,?)').bind('owner', now().slice(0, 10), state.summary, now()).run();
      await remember(this.env, `Episodio ${now().slice(0, 10)}: ${clip(state.summary, 700)}`, 'episode', 'summary', 2).catch(() => null);
    } catch (e: any) {
      console.warn('summarize', e?.message);
    }
    state.history = state.history.slice(-KEEP_AFTER_SUMMARY);
  }

  private async handleCallback(cb: any): Promise<void> {
    const state = await this.load();
    const chatId = String(cb.message?.chat?.id ?? cb.from.id);
    const data: string = cb.data ?? '';
    const [verb, id] = data.split(':');
    const action = state.pending[id];
    if (!action) {
      await answerCallback(this.env, cb.id, 'Esa acción ya no está pendiente.');
      if (cb.message?.message_id) await clearKeyboard(this.env, chatId, cb.message.message_id);
      return;
    }
    delete state.pending[id];
    await this.save();
    if (cb.message?.message_id) await clearKeyboard(this.env, chatId, cb.message.message_id);
    if (verb !== 'ok') {
      await answerCallback(this.env, cb.id, 'Cancelado');
      await audit(this.env, chatId, `${action.tool}:cancelada`, action.args, false);
      state.history.push({ role: 'user', content: `[He cancelado la acción: ${action.summary.split('\n')[0]}]` });
      await this.save();
      await send(this.env, chatId, `Cancelado: ${action.summary.split('\n')[0]}`, { plain: true });
      return;
    }
    await answerCallback(this.env, cb.id, 'Confirmado, en marcha…');
    const spec = getTool(action.tool);
    if (!spec) return void (await send(this.env, chatId, `No encuentro la herramienta ${action.tool}.`, { plain: true }));
    const ctx: ToolCtx = {
      env: this.env,
      chatId,
      confirmed: true,
      depth: 0,
      tz: this.tz,
      onTasksChanged: () => this.rescheduleAlarm(),
      sendFile: (name, content, caption) => sendDocument(this.env, chatId, name, content, caption),
      runSubagent: async () => 'no disponible',
    };
    try {
      const result = await spec.run(action.args, ctx);
      const pretty = typeof result === 'string' ? result : JSON.stringify(result);
      state.history.push({ role: 'user', content: `[He confirmado la acción "${action.summary.split('\n')[0]}". Resultado: ${clip(pretty, 400)}]` });
      await this.save();
      await send(this.env, chatId, `Hecho: ${action.summary.split('\n')[0]}\n${clip(pretty, 500)}`, { plain: true });
    } catch (e: any) {
      await send(this.env, chatId, `La acción confirmada ha fallado: ${clip(String(e?.message ?? e), 500)}`, { plain: true });
    }
  }

  // ---------- Comandos ----------

  private async handleCommand(chatId: string, text: string, messageId: number): Promise<boolean> {
    const state = await this.load();
    const [cmdRaw, ...rest] = text.trim().split(/\s+/);
    const cmd = cmdRaw.toLowerCase().replace(/@.*$/, '');
    const arg = rest.join(' ').trim();
    const reply = (t: string, plain = true) => send(this.env, chatId, t, { replyTo: messageId, plain });
    switch (cmd) {
      case '/start':
      case '/ayuda':
      case '/help':
        await reply(
          `Soy ${this.env.BOT_NAME || 'Secretario'}. Háblame por texto o nota de voz, mándame fotos o archivos, o responde a mis mensajes para seguir el hilo.\n\n` +
            `Puedo: buscar en internet, leer y redactar correos, gestionar agenda y Drive, programar recordatorios y tareas, recordar lo que me cuentas y aprender procedimientos.\n` +
            `Nunca envío, modifico ni borro nada sin que lo confirmes con un botón.\n\n` +
            `Comandos:\n/estado · uso de hoy y salud\n/memoria [búsqueda] · qué recuerdo\n/aprende <texto> · guardar un hecho\n/olvida <id> · archivar un recuerdo (con confirmación)\n/skills · habilidades aprendidas\n/tareas · programadas\n/feedback <texto> · corrígeme o refuérzame\n/modo silencio|normal · avisos proactivos\n/nuevo · empezar conversación limpia\n/google · conectar Gmail, Calendar y Drive`,
        );
        return true;
      case '/estado': {
        const [usage, n, gOk] = await Promise.all([usageSummary(this.env), countMemories(this.env), googleConfigured(this.env)]);
        await reply(
          `Hora local: ${localTime(this.tz)}\nGoogle: ${gOk ? 'conectado' : 'NO conectado (/google)'}\nModo: ${state.mode}\nRecuerdos activos: ${n}\nMensajes en contexto: ${state.history.length}${state.summary ? ' (+ resumen)' : ''}\nPendientes de confirmar: ${Object.keys(state.pending).length}\n\nUso de IA hoy:\n${usage}\nPresupuesto Workers AI: ${this.env.DAILY_NEURON_BUDGET || 9000} neuronas/día`,
        );
        return true;
      }
      case '/memoria': {
        const mems = await listMemories(this.env, 15, arg || undefined);
        await reply(mems.length ? mems.map((m) => `• ${m.id} [${m.kind}] ${m.content}`).join('\n') : 'Todavía no recuerdo nada.');
        return true;
      }
      case '/aprende': {
        if (!arg) return void (await reply('Dime qué guardar: /aprende <texto>')), true;
        const id = await remember(this.env, arg, 'fact', 'command', 4);
        await reply(id ? `Guardado (${id}).` : 'Eso ya lo sabía.');
        return true;
      }
      case '/olvida': {
        if (!arg) return void (await reply('Indica el id: /olvida m_...')), true;
        const p: PendingAction = { id: uid('p_'), tool: 'memory_forget', args: { id: arg }, summary: `Olvidar el recuerdo ${arg}`, createdAt: now() };
        state.pending[p.id] = p;
        await this.save();
        await send(this.env, chatId, `¿Archivo el recuerdo ${arg}?`, { plain: true, keyboard: [[{ text: '✅ Confirmar', data: `ok:${p.id}` }, { text: '❌ Cancelar', data: `no:${p.id}` }]] });
        return true;
      }
      case '/skills': {
        const rows = (await this.env.DB.prepare("SELECT name,description,version,uses FROM skills WHERE status='active' ORDER BY uses DESC").all<any>()).results;
        await reply(rows.length ? rows.map((r) => `• ${r.name} (v${r.version}, ${r.uses} usos): ${r.description}`).join('\n') : 'Aún no he aprendido habilidades. Enséñame un procedimiento y lo guardaré.');
        return true;
      }
      case '/tareas': {
        const rows = (await this.env.DB.prepare("SELECT id,kind,instruction,due_at,cron FROM tasks WHERE chat_id=? AND status='pending' ORDER BY due_at LIMIT 30").bind(chatId).all<any>()).results;
        await reply(rows.length ? rows.map((r) => `• ${r.id} · ${r.due_at}${r.cron ? ` · cron ${r.cron}` : ''} · ${r.kind} · ${r.instruction}`).join('\n') : 'No hay tareas programadas.');
        return true;
      }
      case '/feedback': {
        if (!arg) return void (await reply('Dime qué mejorar o qué te ha gustado: /feedback <texto>')), true;
        const negative = /\b(mal|no|peor|error|equivoc|demasiado|deja de|nunca)\b/i.test(arg);
        await this.env.DB.prepare('INSERT INTO lessons(content,context,sentiment,created_at) VALUES(?,?,?,?)')
          .bind(arg, clip(state.history.slice(-2).map((m) => m.content).join(' | '), 600), negative ? 'negative' : 'positive', now())
          .run();
        await remember(this.env, `Lección: ${arg}`, 'lesson', 'feedback', 4).catch(() => null);
        await reply('Anotado. Lo tendré en cuenta a partir de ahora.');
        return true;
      }
      case '/modo': {
        if (arg === 'silencio' || arg === 'normal') {
          state.mode = arg;
          await this.save();
          await reply(`Modo ${arg}.`);
        } else await reply(`Modo actual: ${state.mode}. Usa /modo silencio o /modo normal.`);
        return true;
      }
      case '/nuevo': {
        if (state.history.length) await this.compactHistory().catch(() => undefined);
        state.history = [];
        state.pending = {};
        await this.save();
        await reply('Conversación reiniciada. La memoria a largo plazo se mantiene.');
        return true;
      }
      case '/google': {
        if (!this.env.GOOGLE_CLIENT_ID || !this.env.PUBLIC_URL) return void (await reply('Faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET o PUBLIC_URL en la configuración del Worker.')), true;
        const stateToken = uid('s_');
        await setSetting(this.env, 'oauth_state', JSON.stringify({ token: stateToken, chatId, exp: Date.now() + 15 * 60_000 }));
        await reply(`Autoriza la cuenta ${this.env.OWNER_EMAIL} aquí (enlace válido 15 minutos):\n${oauthStartUrl(this.env, stateToken)}`);
        return true;
      }
      default:
        return false;
    }
  }

  // ---------- Tareas programadas y latido ----------

  async rescheduleAlarm(): Promise<void> {
    const next = await this.env.DB.prepare("SELECT MIN(due_at) AS d FROM tasks WHERE status='pending'").first<{ d: string | null }>();
    if (next?.d) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, new Date(next.d).getTime()));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    await this.load();
    const due = (
      await this.env.DB.prepare("SELECT * FROM tasks WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 5").bind(new Date(Date.now() + 30_000).toISOString()).all<any>()
    ).results;
    for (const t of due) {
      let result = '';
      let status = 'done';
      try {
        if (t.kind === 'agent') {
          const r = await runAgent(this.env, {
            chatId: t.chat_id,
            tz: this.tz,
            history: [{ role: 'user', content: `[Tarea programada ${t.id}] ${t.instruction}` }],
            summary: this.state.summary,
            onTasksChanged: async () => undefined,
            sendFile: (name, content, caption) => sendDocument(this.env, t.chat_id, name, content, caption),
          });
          result = r.text;
          await send(this.env, t.chat_id, `🗓 Tarea programada: ${clip(t.instruction, 80)}\n\n${r.text}`);
          this.state.history.push({ role: 'assistant', content: `[Ejecuté la tarea programada "${clip(t.instruction, 80)}"]: ${clip(r.text, 500)}` });
        } else {
          result = 'aviso enviado';
          await send(this.env, t.chat_id, `⏰ Recordatorio: ${t.instruction}`);
        }
      } catch (e: any) {
        status = 'failed';
        result = String(e?.message ?? e);
        await send(this.env, t.chat_id, `La tarea programada "${clip(t.instruction, 60)}" ha fallado: ${clip(result, 300)}`, { plain: true }).catch(() => undefined);
      }
      let nextDue: string | null = null;
      if (t.cron) nextDue = nextCron(String(t.cron))?.toISOString() ?? null;
      if (nextDue) await this.env.DB.prepare("UPDATE tasks SET due_at=?, last_run_at=?, last_result=?, status='pending' WHERE id=?").bind(nextDue, now(), clip(result, 2000), t.id).run();
      else await this.env.DB.prepare('UPDATE tasks SET status=?, last_run_at=?, last_result=? WHERE id=?').bind(status, now(), clip(result, 2000), t.id).run();
    }
    await this.save();
    await this.rescheduleAlarm();
  }

  private async runHeartbeat(): Promise<void> {
    const state = await this.load();
    if ((this.env.HEARTBEAT_ENABLED ?? 'true') !== 'true' || state.mode === 'silencio') return;
    if (inQuietHours(this.env.QUIET_HOURS, this.tz)) return;
    const chatId = (await getSetting(this.env, 'owner_chat_id')) || this.env.OWNER_CHAT_ID;
    if (!chatId) return;
    const text = await heartbeat(this.env, this.env.OWNER_NAME || 'Pablo');
    if (text) {
      await send(this.env, chatId, text);
      state.history.push({ role: 'assistant', content: `[Aviso proactivo enviado]: ${clip(text, 500)}` });
      await this.save();
    }
    // Consolidación diaria del perfil a primera hora.
    const stamp = now().slice(0, 10);
    if ((await getSetting(this.env, 'profile_day')) !== stamp) {
      await setSetting(this.env, 'profile_day', stamp);
      const { consolidateProfile } = await import('./agent');
      this.ctx.waitUntil(consolidateProfile(this.env).catch((e) => console.warn('perfil', e?.message)));
    }
    // También comprobamos tareas vencidas por si la alarma se perdió.
    await this.rescheduleAlarm();
  }
}

