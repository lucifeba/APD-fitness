import { learn, runAgent, summarize } from './agent';
import { audit, getSetting, receipt, setSetting, usageSummary } from './db';
import { ask } from './router';
import { syncReminders } from './reminders';
import type { ChatMessage, Env, Incoming, PendingAction } from './env';
import { googleConfigured, oauthStartUrl } from './google';
import { heartbeat } from './heartbeat';
import { analyzeImage, isImageAttachment, transcribe } from './media';
import { countMemories, listMemories, remember } from './memory';
import { countDocuments, extractText, ingestDocument, listDocuments } from './knowledge';
import { ALL_TOOLS, resolveTool } from './tools';
import { driveFolderId, findMentionedDriveFolder, importDriveFolderKnowledge, PERMANENT_DRIVE_ROOT_ID } from './tools/googleTools';
import { normalizeSecretName, vaultList, vaultSet } from './tools/autonomyTools';
import type { ToolCtx } from './tools/types';
import { answerCallback, clearKeyboard, downloadFile, send, sendDocument, tg, typing } from './telegram';
import { buildAgenda, renderAgenda } from './agenda';
import { addDays, clip, inQuietHours, localParts, localTime, longDate, nextCron, now, resolveDay, uid } from './util';
import { importSalesDashboard, telegramDashboardSummary } from './salesDashboard';
import { importPlanningSource, syncOperationalData, telegramPlanningSummary } from './planningStore';
import {
  isLongTelegramUpdate,
  TELEGRAM_JOB_LEASE_MS,
  TELEGRAM_JOB_MAX_ATTEMPTS,
  TELEGRAM_JOB_PREFIX,
  TELEGRAM_JOB_RETENTION_MS,
  telegramJobDue,
  telegramJobId,
  telegramRetryDelayMs,
  type TelegramJob,
} from './telegramQueue';

interface State {
  history: ChatMessage[];
  summary: string;
  pending: Record<string, PendingAction>;
  mode: 'normal' | 'silencio';
  lastActivity: string;
  lastImage?: { analysis: string; title: string; at: string };
}

const MAX_HISTORY = 24;
const KEEP_AFTER_SUMMARY = 10;

export function driveFolderUrls(text: string): string[] {
  return [...new Set([...text.matchAll(/https?:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[\w-]+[^\s)]*/gi)].map((m) => m[0]))];
}

export class SecretarioSession implements DurableObject {
  private state!: State;
  private loaded = false;
  /** La web espera respuesta síncrona. Telegram usa la bandeja persistente del Durable Object. */
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
      if (url.pathname === '/web-message' && request.method === 'POST') {
        const { chatId, text } = await request.json<{ chatId: string; text: string }>();
        if (typeof text !== 'string' || !text.trim() || text.length > 16000) return Response.json({ error: 'Mensaje vacío o demasiado largo' }, { status: 400 });
        const task = this.queue.then(async () => {
          await send(this.env, chatId, `Desde la web:\n${text}`, { plain: true, skipHistory: true });
          await this.converse(chatId, { chatId, messageId: 0, text, kind: 'text' }, 'web');
        });
        this.queue = task.catch((e) => console.error('web message', e));
        await task;
        return Response.json({ ok: true });
      } else if (url.pathname === '/update') {
        const update = await request.json<any>();
        const queued = await this.enqueueTelegram(update);
        return Response.json({ ok: true, queued: true, duplicate: !queued.created, job: queued.id });
      } else if (url.pathname === '/health') {
        return Response.json(await this.queueHealth());
      } else if (url.pathname === '/heartbeat') {
        await this.runHeartbeat();
      } else if (url.pathname === '/reminders') {
        // Sondeo ligero independiente del latido: detecta también tareas creadas
        // directamente en Google Tasks y conserva el aviso de 15 minutos.
        const chatId = (await getSetting(this.env, 'owner_chat_id')) || this.env.OWNER_CHAT_ID;
        if (chatId && (await syncReminders(this.env, chatId, this.tz).catch(() => 0)) > 0) await this.rescheduleAlarm();
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

  private async telegramJobs(): Promise<Array<{ key: string; job: TelegramJob }>> {
    const rows = await this.ctx.storage.list<TelegramJob>({ prefix: TELEGRAM_JOB_PREFIX });
    return [...rows.entries()].map(([key, job]) => ({ key, job })).sort((a, b) => a.job.createdAt - b.job.createdAt);
  }

  private async queueHealth(): Promise<Record<string, unknown>> {
    const jobs = await this.telegramJobs();
    const counts = { pending: 0, running: 0, failed: 0 };
    for (const { job } of jobs) if (job.status in counts) counts[job.status as keyof typeof counts]++;
    return { ok: true, ...counts, lastActivity: this.state.lastActivity };
  }

  private async enqueueTelegram(update: any): Promise<{ id: string; created: boolean }> {
    const id = telegramJobId(update);
    const key = `${TELEGRAM_JOB_PREFIX}${id}`;
    const existing = await this.ctx.storage.get<TelegramJob>(key);
    if (existing) {
      await this.rescheduleAlarm();
      return { id, created: false };
    }
    const at = Date.now();
    const job: TelegramJob = { id, update, status: 'pending', attempts: 0, createdAt: at, updatedAt: at, nextAttemptAt: at };
    await this.ctx.storage.put(key, job);
    await this.rescheduleAlarm();
    if (isLongTelegramUpdate(update)) {
      const message = update.message;
      const chatId = String(message?.chat?.id ?? '');
      if (chatId) {
        job.acknowledged = true;
        job.updatedAt = Date.now();
        await this.ctx.storage.put(key, job);
        this.ctx.waitUntil(
          send(this.env, chatId, 'Lo tengo. Estoy localizando y analizando el material; te responderé aquí sin que tengas que repetir nada.', {
            plain: true,
            replyTo: message?.message_id,
            skipHistory: true,
          }).catch((error) => console.warn('telegram acknowledgement', error instanceof Error ? error.message : String(error))),
        );
      }
    }
    return { id, created: true };
  }

  private async nextTelegramJob(at = Date.now()): Promise<{ key: string; job: TelegramJob } | null> {
    const jobs = await this.telegramJobs();
    return jobs.find(({ job }) => telegramJobDue(job, at)) ?? null;
  }

  private async processTelegramJob(): Promise<boolean> {
    const selected = await this.nextTelegramJob();
    if (!selected) return false;
    const { key } = selected;
    const leaseUntil = Date.now() + TELEGRAM_JOB_LEASE_MS;
    const job: TelegramJob = {
      ...selected.job,
      status: 'running',
      attempts: selected.job.attempts + 1,
      updatedAt: Date.now(),
      leaseUntil,
    };
    await this.ctx.storage.put(key, job);
    // Si la ejecución es interrumpida, esta alarma recuperará el trabajo al vencer el lease.
    await this.ctx.storage.setAlarm(leaseUntil);
    try {
      await this.handleUpdate(job.update);
      job.status = 'done';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.lastError = undefined;
      job.leaseUntil = undefined;
      await this.ctx.storage.put(key, job);
      await audit(this.env, null, 'telegram_job_done', { id: job.id, attempts: job.attempts }).catch(() => undefined);
    } catch (error) {
      const detail = clip(error instanceof Error ? error.message : String(error), 2000);
      job.updatedAt = Date.now();
      job.lastError = detail;
      job.leaseUntil = undefined;
      const message = job.update?.message ?? job.update?.callback_query?.message;
      const chatId = String(message?.chat?.id ?? '');
      if (job.attempts >= TELEGRAM_JOB_MAX_ATTEMPTS) {
        job.status = 'failed';
        await this.ctx.storage.put(key, job);
        const incident = uid('inc_');
        await audit(this.env, chatId || null, 'telegram_job_failed', { incident, id: job.id, attempts: job.attempts, detail }, false).catch(() => undefined);
        if (chatId)
          await send(this.env, chatId, `No he podido completar esta acción tras ${job.attempts} intentos automáticos. La incidencia ${incident} ha quedado registrada; el mensaje y el material siguen conservados.`, { plain: true, replyTo: message?.message_id, skipHistory: true }).catch(() => undefined);
      } else {
        job.status = 'pending';
        job.nextAttemptAt = Date.now() + telegramRetryDelayMs(job.attempts);
        await this.ctx.storage.put(key, job);
        await audit(this.env, chatId || null, 'telegram_job_retry', { id: job.id, attempt: job.attempts, nextAttemptAt: job.nextAttemptAt, detail }, false).catch(() => undefined);
        if (chatId && job.attempts === 1)
          await send(this.env, chatId, 'He encontrado una incidencia temporal durante el proceso. La estoy reintentando automáticamente; no vuelvas a enviar el mensaje.', { plain: true, replyTo: message?.message_id, skipHistory: true }).catch(() => undefined);
      }
    }
    return true;
  }

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
    const rawText = [msg.text, msg.caption].filter(Boolean).join('\n');
    const pastedFolderUrls = driveFolderUrls(rawText);
    // Los nombres de carpeta son suficientes: Aravitas resuelve la ruta desde la
    // raíz permanente y prepara los documentos antes de invocar al modelo.
    if (!pastedFolderUrls.length && /\b(carpeta|subcarpeta|drive|transcripci[oó]n|reuni[oó]n(?:es)?\s+de\s+ciclo)\b/i.test(rawText)) {
      const storedRoot = await getSetting(this.env, 'transcriptions_drive_folder_id');
      const rootId = storedRoot && !['1kzhQtUfpldiBo9hLGUFClVfj7JTRu8sQ', '1jgjreBjijah7AxHuQrSp50Vm13qTGMlA'].includes(storedRoot)
        ? storedRoot
        : PERMANENT_DRIVE_ROOT_ID;
      try {
        const resolved = await findMentionedDriveFolder(this.env, rawText, rootId);
        if (resolved) {
          const shouldImport = /\b(analiz|lee|leer|revis|prepar|crea|genera|informe|documento|resum|extrae)\w*/i.test(rawText);
          let importContext = '';
          if (shouldImport) {
            const imported = await importDriveFolderKnowledge(this.env, chatId, resolved.id, {
              max: 20,
              exclude: ['Preguntas Averiguar', 'Optimización del Consejo Farmacéutico'],
            });
            const usable = imported.documents.filter((d) => d.ok && d.doc_id);
            importContext = ` Se han preparado ${imported.successful} documentos (${imported.failed} fallos). doc_id: ${usable.map((d) => `${d.doc_id} (${d.file})`).join('; ') || 'ninguno'}.`;
          }
          parts.push(`[CONTEXTO INTERNO: carpeta resuelta automáticamente desde la raíz permanente: ${resolved.path}; drive_folder_id=${resolved.id}; URL=${resolved.url}.${importContext} Ejecuta ahora la petición original y guarda el resultado en esta carpeta cuando corresponda. Está prohibido pedir un enlace o limitarse a confirmar la localización.]`);
          console.log('drive folder auto-resolution', { chatId, rootId, resolved: resolved.path, folderId: resolved.id, imported: shouldImport });
          await audit(this.env, chatId, 'drive_folder_auto_resolve', { rootId, message: clip(rawText, 500), resolved, imported: shouldImport });
        }
      } catch (error) {
        console.warn('drive folder auto-resolution failed', error instanceof Error ? error.message : String(error));
        parts.push(`[CONTEXTO INTERNO: la resolución automática de carpeta falló: ${error instanceof Error ? error.message : String(error)}. Intenta drive_resolve_folder o drive_search dentro de la raíz permanente antes de preguntar al usuario.]`);
      }
    }
    for (const folderUrl of pastedFolderUrls.slice(0, 2)) {
      const folderId = driveFolderId(folderUrl);
      const storedFolder = await getSetting(this.env, 'transcriptions_drive_folder_id');
      const recentContext = `${rawText}\n${this.state.history.slice(-4).map((m) => m.content).join('\n')}`;
      const knownTranscriptions = storedFolder === folderId || /transcripci[oó]n|acompa[ñn]amiento/i.test(recentContext);
      try {
        const imported = await importDriveFolderKnowledge(this.env, chatId, folderId, {
          max: 20,
          exclude: ['Preguntas Averiguar', 'Optimización del Consejo Farmacéutico'],
        });
        const usable = imported.documents.filter((d) => d.ok && d.doc_id);
        if (knownTranscriptions) {
          await setSetting(this.env, 'transcriptions_drive_folder_id', folderId);
          if (await receipt(this.env, `transcriptions-folder:${folderId}`))
            await remember(this.env, `La carpeta permanente de transcripciones y acompañamientos de Ara es https://drive.google.com/drive/folders/${folderId}. Debe consultarse para análisis de delegados y visitas. Se excluyen Preguntas Averiguar y Optimización del Consejo Farmacéutico.`, 'project', 'drive-folder', 5).catch(() => null);
        }
        parts.push(
          `[CONTEXTO INTERNO: enlace de carpeta Drive detectado y procesado automáticamente. Carpeta ${folderId}; ${imported.successful} documentos disponibles, ${imported.failed} fallos, ${imported.excluded.length} excluidos. Documentos utilizables: ${usable.map((d) => `${d.doc_id} (${d.file})`).join('; ') || 'ninguno'}. Para el análisis completo usa knowledge_analyze con estos doc_id. Si debes crear el informe en Drive, indica google_doc_title y drive_folder_id=${folderId}; la herramienta devolverá el enlace directo. No pidas que vuelvan a pegar el enlace ni que conviertan los PDF.]`,
        );
      } catch (error) {
        parts.push(`[CONTEXTO INTERNO: no se pudo importar la carpeta ${folderId}: ${error instanceof Error ? error.message : String(error)}. Informa del fallo concreto y no finjas que fue procesada.]`);
      }
    }
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
      const sizes = [...msg.photo].sort((a: any, b: any) => (b.width * b.height) - (a.width * a.height));
      const pick = sizes.find((p: any) => (p.file_size ?? 0) <= 20 * 1024 * 1024) ?? sizes[0];
      try {
        const { bytes } = await downloadFile(this.env, pick.file_id);
        const result = await analyzeImage(this.env, bytes, 'telegram-photo.jpg', 'image/jpeg', msg.caption ? `El usuario dice: "${msg.caption}". Lee el pantallazo completo, transcribe el correo o documento y después interprétalo según su instrucción.` : 'Lee el pantallazo completo, transcribe todo el texto y explica su contenido.');
        const d=result.text;
        this.state.lastImage = { analysis: d, title: msg.caption || 'Imagen de Telegram', at: now() };
        parts.push(`[Imagen leída correctamente por ${[result.ocr?'OCR':'',result.vision?'visión':''].filter(Boolean).join(' + ')}]: ${d}`);
        // Toda imagen queda en la base de conocimiento (descripción y texto transcrito).
        try {
          const doc = await ingestDocument(this.env, { title: `Foto ${now().slice(0, 16).replace('T', ' ')}${msg.caption ? ` · ${clip(msg.caption, 60)}` : ''}`, text: d, source: 'photo', mime: 'image/jpeg' });
          parts.push(`[Guardada en la base de conocimiento como ${doc.id}]`);
        } catch (e: any) {
          console.warn('ingesta foto', e?.message);
        }
      } catch (e: any) {
        parts.push(`[No pude analizar la imagen: ${e.message}]`);
      }
    }
    if (msg.document) {
      kind = 'document';
      const d = msg.document;
      const name = String(d.file_name || 'archivo');
      const size = Number(d.file_size ?? 0);
      if (size > 20 * 1024 * 1024) parts.push(`[Archivo adjunto: ${name} (${Math.round(size / 1024 / 1024)} MB). Telegram solo me deja descargar archivos de hasta 20 MB; compártelo por Drive y lo leo desde allí.]`);
      else {
        try {
          const { bytes } = await downloadFile(this.env, d.file_id);
          if (isImageAttachment(d.mime_type, name)) {
            const result=await analyzeImage(this.env,bytes,name,d.mime_type,msg.caption ? `Instrucción del usuario: "${msg.caption}". Lee la imagen completa, transcribe el texto y conserva cifras, nombres y estructura.` : 'Lee la imagen completa, transcribe todo el texto y explica su contenido.');
            const analysis=result.text;
            this.state.lastImage = { analysis, title: name, at: now() };
            const doc = await ingestDocument(this.env, { title: name.replace(/\.[a-z0-9]+$/i, ''), text: analysis, source: 'telegram-image', mime: d.mime_type });
            parts.push(`[Imagen ${name} leída por ${[result.ocr?'OCR':'',result.vision?'visión':''].filter(Boolean).join(' + ')} y guardada como ${doc.id}. Puedes pedirme que redacte, resuma o responda usando su contenido.]\n[Análisis visual y texto]:\n${clip(analysis, 14000)}`);
            return { chatId, messageId: msg.message_id, text: parts.join('\n'), kind: 'photo' };
          }
          if (/cuadro\s*mando/i.test(name) && /\.xlsx$/i.test(name)) {
            const result = await importSalesDashboard(this.env, bytes, name, 'telegram', String(msg.from?.username || msg.from?.id || chatId));
            parts.push(`[${telegramDashboardSummary(result)}]`);
            return { chatId, messageId: msg.message_id, text: parts.join('\n'), kind };
          }
          if (/planificaci[oó]n|planning|delegad/i.test(name) && /\.xlsx$/i.test(name)) {
            const explicit=`${msg.caption||''} ${name}`.match(/(20\d{2})[-_ ](0?[1-9]|1[0-2])/),today=new Intl.DateTimeFormat('en-CA',{timeZone:this.env.TIMEZONE||'Europe/Madrid',year:'numeric',month:'2-digit'}).format(new Date()),month=explicit?`${explicit[1]}-${String(Number(explicit[2])).padStart(2,'0')}`:today;
            const result=await importPlanningSource(this.env,bytes,name,month,'telegram',String(msg.from?.username||msg.from?.id||chatId));
            parts.push(`[${telegramPlanningSummary(result)}]`);
            return {chatId,messageId:msg.message_id,text:parts.join('\n'),kind};
          }
          const { text, how } = await extractText(this.env, name, d.mime_type, bytes);
          const doc = await ingestDocument(this.env, { title: name.replace(/\.[a-z0-9]+$/i, ''), text, source: 'telegram', mime: d.mime_type });
          parts.push(
            `[Archivo ${name} (${how}, ${text.length} caracteres) guardado en la base de conocimiento como ${doc.id} en ${doc.chunks} fragmentos; ${doc.facts} hechos anotados en memoria. Resumen: ${doc.summary}. Para analizarlo completo usa knowledge_analyze con doc_id ${doc.id}; no encadenes lecturas parciales.]\n[Inicio del contenido]:\n${clip(text, 12000)}`,
          );
        } catch (e: any) {
          parts.push(`[No pude procesar el archivo ${name}: ${e.message}]`);
        }
      }
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

  private async converse(chatId: string, incoming: Incoming, source = 'telegram'): Promise<void> {
    const state = await this.load();
    let userText = incoming.text;
    if (incoming.kind === 'text' && state.lastImage && /\b(imagen|foto|pantallazo|captura|archivo visual|esto)\b/i.test(userText)) {
      const age = Date.now() - Date.parse(state.lastImage.at);
      if (age >= 0 && age < 24 * 60 * 60 * 1000) userText = `[Contexto de la última imagen, ${state.lastImage.title}: ${clip(state.lastImage.analysis, 9000)}]\n${userText}`;
    }
    if (incoming.replyTo) userText = `[Respondiendo a ${incoming.replyTo.fromBot ? 'tu mensaje' : 'un mensaje'}: "${incoming.replyTo.text}"]\n${userText}`;
    state.history.push({ role: 'user', content: userText });
    await this.env.DB.prepare('INSERT INTO conversation_messages(chat_id,role,source,content) VALUES(?,?,?,?)').bind(chatId, 'user', source, userText).run();
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
        sendText: async (text) => void (await send(this.env, chatId, text)),
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
      await send(this.env, chatId, result.text || '(sin respuesta)', { replyTo: incoming.messageId || undefined, keyboard: keyboard.length ? keyboard : undefined });
      await this.compactHistory();
      await this.save();
      // Si ha creado o movido eventos o tareas, programamos ya sus avisos sin esperar al latido.
      if (result.toolsUsed.some((t) => /^(calendar_create|calendar_update|gtasks_create)$/.test(t)))
        this.ctx.waitUntil(
          syncReminders(this.env, chatId, this.tz)
            .then(async (n) => {
              if (n) await this.rescheduleAlarm();
            })
            .catch((e) => console.warn('avisos', e?.message)),
        );
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
      const incident = uid('inc_');
      const detail = clip(String(e?.message ?? e), 3000);
      console.error('converse failed', incident, detail);
      await audit(this.env, chatId, 'agent_error', { incident, detail }, false).catch(() => undefined);
      throw e;
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
    const spec = await resolveTool(this.env, action.tool);
    if (!spec) return void (await send(this.env, chatId, `No encuentro la herramienta ${action.tool}.`, { plain: true }));
    const ctx: ToolCtx = {
      env: this.env,
      chatId,
      confirmed: true,
      depth: 0,
      tz: this.tz,
      onTasksChanged: () => this.rescheduleAlarm(),
      sendFile: (name, content, caption) => sendDocument(this.env, chatId, name, content, caption),
      sendText: async (text) => void (await send(this.env, chatId, text)),
      runSubagent: async () => 'no disponible',
    };
    try {
      const result = await spec.run(action.args, ctx);
      if(/^(calendar_create|calendar_update|calendar_delete|pharmacy_visit_create)$/.test(action.tool))this.ctx.waitUntil(syncOperationalData(this.env).catch((e)=>console.warn('calendar crm sync',e?.message)));
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
            `Mándame cualquier archivo (PDF, Word, Excel, imágenes, texto...) o enlace y lo guardo en mi base de conocimiento para usarlo después.\n\n` +
            `Comandos:\n/agenda [hoy|mañana|semana|lunes|12/09] · eventos de todos tus calendarios y tareas\n/sincronizar · actualizar Calendarios, panel y CRM XLSX\n/docs · documentos que conozco\n/herramientas · herramientas que he creado y credenciales guardadas\n/secreto NOMBRE valor · guardar una credencial cifrada para APIs\n/instrucciones · reglas que me he dado a mí mismo\n/estado · uso de hoy y salud\n/memoria [búsqueda] · qué recuerdo\n/aprende <texto> · guardar un hecho\n/olvida <id> · archivar un recuerdo (con confirmación)\n/skills · habilidades aprendidas\n/tareas · programadas\n/feedback <texto> · corrígeme o refuérzame\n/modo silencio|normal · avisos proactivos\n/nuevo · empezar conversación limpia\n/google · conectar Gmail, Calendar y Drive`,
        );
        return true;
      case '/sincronizar': {
        const p:PendingAction={id:uid('p_'),tool:'crm_synchronize',args:{month:arg},summary:`Sincronizar calendarios, panel y CRM XLSX${arg?` (${arg})`:''}`,createdAt:now()};
        state.pending[p.id]=p;await this.save();
        await send(this.env,chatId,'Voy a reconciliar los dos calendarios, el panel y el mismo archivo XLSX de Drive.',{plain:true,keyboard:[[{text:'✅ Confirmar sincronización',data:`ok:${p.id}`},{text:'❌ Cancelar',data:`no:${p.id}`}]]});
        return true;
      }
      case '/estado': {
        const [usage, n, gOk, nDocs, nTools] = await Promise.all([
          usageSummary(this.env),
          countMemories(this.env),
          googleConfigured(this.env),
          countDocuments(this.env),
          this.env.DB.prepare("SELECT COUNT(*) AS n FROM dyn_tools WHERE status='active'").first<{ n: number }>().then((r) => Number(r?.n ?? 0)),
        ]);
        await reply(
          `Hora local: ${localTime(this.tz)}\nGoogle: ${gOk ? 'conectado' : 'NO conectado (/google)'}\nModo: ${state.mode}\nRecuerdos activos: ${n}\nDocumentos en conocimiento: ${nDocs}\nHerramientas creadas por mí: ${nTools}\nMensajes en contexto: ${state.history.length}${state.summary ? ' (+ resumen)' : ''}\nPendientes de confirmar: ${Object.keys(state.pending).length}\n\nUso de IA hoy:\n${usage}\nPresupuesto Workers AI: ${this.env.DAILY_NEURON_BUDGET || 9000} neuronas/día`,
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
      case '/agenda': {
        if (!(await googleConfigured(this.env))) return void (await reply('Google no está conectado. Usa /google primero.')), true;
        const [first, ...more] = arg.split(/\s+/).filter(Boolean);
        let day: string | null;
        let days = 1;
        if (!first || first.toLowerCase() === 'semana') {
          day = resolveDay('hoy', this.tz);
          if (first) days = 7;
        } else {
          day = resolveDay(first, this.tz);
          const n = Number(more[0]);
          if (more[0]?.toLowerCase() === 'semana') days = 7;
          else if (n > 0) days = Math.min(31, n);
        }
        if (!day) return void (await reply(`No entiendo "${first}". Usa: /agenda, /agenda mañana, /agenda semana, /agenda lunes, /agenda 12/09 o /agenda 2026-09-12 [días].`)), true;
        await typing(this.env, chatId);
        const ag = await buildAgenda(this.env, this.tz, day, days);
        await reply(renderAgenda(ag, this.tz), false);
        return true;
      }
      case '/docs': {
        const docs = await listDocuments(this.env, 25);
        await reply(
          docs.length
            ? `📚 **Base de conocimiento** (${docs.length} documentos recientes)\n\n${docs.map((d) => `• ${d.id} · **${d.title}** · ${d.chunks} fragmentos · ${d.created_at.slice(0, 10)}\n  _${clip(d.summary ?? '', 160)}_`).join('\n\n')}\n\nPara borrar uno, dímelo por su id.`
            : 'La base de conocimiento está vacía. Mándame archivos, fotos o enlaces y los guardaré.',
          false,
        );
        return true;
      }
      case '/instrucciones': {
        if (arg.toLowerCase() === 'borrar') {
          await setSetting(this.env, 'self_prompt', '');
          await reply('Instrucciones propias borradas.');
        } else {
          const sp = (await getSetting(this.env, 'self_prompt')) || '';
          await reply(sp ? `📝 Instrucciones que me he dado a mí mismo:\n\n${sp}\n\nPara vaciarlas: /instrucciones borrar` : 'Aún no me he dado instrucciones propias. Cuando descubra reglas o preferencias las guardaré aquí.');
        }
        return true;
      }
      case '/secreto': {
        const [rawName, ...valueParts] = arg.split(/\s+/);
        const value = valueParts.join(' ').trim();
        if (!rawName || !value) return void (await reply('Uso: /secreto NOMBRE valor  (p. ej. /secreto STRAVA_TOKEN abc123). Se guarda cifrado y el agente lo usa como {{secret:NOMBRE}}.')), true;
        const name = normalizeSecretName(rawName);
        await vaultSet(this.env, name, value);
        await audit(this.env, chatId, 'vault_set', { name });
        // Borramos tu mensaje para que la clave no quede en el chat.
        await tg(this.env, 'deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => undefined);
        await send(this.env, chatId, `🔐 Credencial ${name} guardada cifrada. He borrado tu mensaje para que no quede en el chat. Guardadas: ${(await vaultList(this.env)).join(', ')}.`, { plain: true });
        return true;
      }
      case '/herramientas': {
        const rows = (await this.env.DB.prepare("SELECT name,description,version,uses FROM dyn_tools WHERE status='active' ORDER BY name").all<any>()).results;
        const secrets = await vaultList(this.env);
        await reply(
          `🧰 **Herramientas fijas**: ${ALL_TOOLS.length}\n\n**Creadas por el agente** (${rows.length}):\n${rows.length ? rows.map((r) => `• ${r.name} (v${r.version}, ${r.uses} usos): ${r.description}`).join('\n') : '— ninguna todavía —'}\n\n**Credenciales en el baúl**: ${secrets.length ? secrets.join(', ') : 'ninguna'}`,
          false,
        );
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
    const jobs = await this.telegramJobs();
    const inboxTimes = jobs.flatMap(({ job }) => {
      if (job.status === 'pending') return [job.nextAttemptAt];
      if (job.status === 'running') return [Number(job.leaseUntil || Date.now())];
      return [];
    });
    const taskTime = next?.d ? new Date(next.d).getTime() : Number.POSITIVE_INFINITY;
    const inboxTime = inboxTimes.length ? Math.min(...inboxTimes) : Number.POSITIVE_INFINITY;
    const alarmAt = Math.min(taskTime, inboxTime);
    if (Number.isFinite(alarmAt)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, alarmAt));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    await this.load();
    await this.processTelegramJob();
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
            sendText: async (text) => void (await send(this.env, t.chat_id, text)),
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
    const oldJobs = (await this.telegramJobs()).filter(({ job }) => job.status === 'done' && Number(job.completedAt || job.updatedAt) < Date.now() - TELEGRAM_JOB_RETENTION_MS);
    if (oldJobs.length) await this.ctx.storage.delete(oldJobs.map(({ key }) => key));
    await this.save();
    await this.rescheduleAlarm();
  }

  /**
   * Parte diario a la hora DAILY_BRIEF (ventana de 30 min, una vez al día): agenda de mañana con semáforo,
   * pendientes y una propuesta razonada de replanificación que termina en una sola pregunta. No mueve nada.
   */
  private async dailyBrief(chatId: string): Promise<void> {
    const spec = (this.env.DAILY_BRIEF || '').trim();
    const m = spec.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || !(await googleConfigured(this.env))) return;
    const p = localParts(this.tz);
    const [h, mi] = p.time.split(':').map(Number);
    const nowMin = h * 60 + mi;
    const target = Number(m[1]) * 60 + Number(m[2]);
    if (nowMin < target || nowMin >= target + 30) return;
    if (!(await receipt(this.env, `brief:${p.date}`))) return;
    const tomorrow = addDays(p.date, 1);
    const ag = await buildAgenda(this.env, this.tz, tomorrow, 1);
    const rendered = renderAgenda(ag, this.tz);
    const owner = this.env.OWNER_NAME || 'Pablo';
    let proposal = '';
    try {
      proposal = await ask(
        this.env,
        'smart',
        `Eres el secretario personal de ${owner}. Recibes la agenda de mañana ya formateada (eventos de todos sus calendarios, tareas que vencen, vencidas y solapamientos). Redacta en español de España, breve y accionable, SOLO estas partes:
1) "Resumen ejecutivo": dos frases con lo importante de mañana.
2) "Propuesta": si hay solapamientos, tareas vencidas o carga irreal, propón cambios concretos (qué mover, a qué hora, qué delegar o descartar), considerando desplazamientos y descansos. Si todo está bien, dilo en una línea.
3) Termina con UNA sola pregunta de confirmación (p. ej. "¿Aplico estos cambios?"). No inventes eventos ni datos. No repitas la agenda.`,
        `Hoy es ${longDate(p.date)}. Agenda de mañana:\n\n${rendered}`,
        600,
      );
    } catch (e: any) {
      console.warn('propuesta parte diario', e?.message);
    }
    await send(this.env, chatId, `🗓 **Parte de mañana**\n\n${rendered}${proposal ? `\n\n${proposal}` : ''}`);
    this.state.history.push({ role: 'assistant', content: `[Parte diario enviado para ${tomorrow}]: ${clip(rendered, 800)}\n${clip(proposal, 600)}` });
    await this.save();
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
    await this.dailyBrief(chatId).catch((e) => console.warn('parte diario', e?.message));
    if ((await syncReminders(this.env, chatId, this.tz).catch(() => 0)) > 0) await this.rescheduleAlarm();
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
