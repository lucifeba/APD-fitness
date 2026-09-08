import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { base64UrlDecode, base64UrlEncode, htmlToText } from './util';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/tasks',
];

let cached: { token: string; exp: number } | null = null;

async function refreshToken(env: Env): Promise<string> {
  return env.GOOGLE_REFRESH_TOKEN || (await getSetting(env, 'google_refresh_token')) || '';
}

export async function googleConfigured(env: Env): Promise<boolean> {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && (await refreshToken(env)));
}

export async function accessToken(env: Env): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const rt = await refreshToken(env);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !rt)
    throw new Error('Google no está conectado. Usa /google para autorizar la cuenta.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json<any>();
  cached = { token: String(j.access_token), exp: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export function oauthStartUrl(env: Env, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || '',
    redirect_uri: `${env.PUBLIC_URL}/oauth/callback`,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
    login_hint: env.OWNER_EMAIL || '',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function oauthExchange(env: Env, code: string): Promise<void> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: `${env.PUBLIC_URL}/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const j = await r.json<any>();
  if (!r.ok || !j.refresh_token) throw new Error(`Google no devolvió refresh_token: ${JSON.stringify(j).slice(0, 300)}`);
  await setSetting(env, 'google_refresh_token', String(j.refresh_token));
  cached = null;
}

export async function gapi<T = any>(env: Env, url: string, init: RequestInit = {}): Promise<T> {
  const t = await accessToken(env);
  const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Google ${r.status} ${url.split('?')[0].replace('https://', '')}: ${(await r.text()).slice(0, 300)}`);
  if (r.status === 204) return {} as T;
  const ct = r.headers.get('content-type') || '';
  return (ct.includes('json') ? await r.json() : await r.text()) as T;
}

// ---------- Gmail ----------

const header = (h: any[] | undefined, name: string) => h?.find((x) => String(x.name).toLowerCase() === name.toLowerCase())?.value ?? '';

function extractBody(payload: any): { text: string; attachments: string[] } {
  const attachments: string[] = [];
  let text = '';
  let html = '';
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename) attachments.push(p.filename);
    const data = p.body?.data;
    if (data && p.mimeType === 'text/plain' && !text) text = base64UrlDecode(data);
    else if (data && p.mimeType === 'text/html' && !html) html = base64UrlDecode(data);
    for (const part of p.parts ?? []) walk(part);
  };
  walk(payload);
  return { text: (text || htmlToText(html)).trim(), attachments };
}

export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}

export async function gmailSearch(env: Env, q: string, max = 10): Promise<MailSummary[]> {
  const list = await gapi<any>(env, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  const out: MailSummary[] = [];
  for (const m of list.messages ?? []) {
    const d = await gapi<any>(env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
    out.push({
      id: d.id,
      threadId: d.threadId,
      from: header(d.payload?.headers, 'From'),
      to: header(d.payload?.headers, 'To'),
      subject: header(d.payload?.headers, 'Subject') || '(sin asunto)',
      date: header(d.payload?.headers, 'Date'),
      snippet: d.snippet ?? '',
      labels: d.labelIds ?? [],
    });
  }
  return out;
}

export async function gmailRead(env: Env, id: string): Promise<MailSummary & { body: string; attachments: string[]; messageId: string }> {
  const d = await gapi<any>(env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const { text, attachments } = extractBody(d.payload);
  return {
    id: d.id,
    threadId: d.threadId,
    from: header(d.payload?.headers, 'From'),
    to: header(d.payload?.headers, 'To'),
    subject: header(d.payload?.headers, 'Subject') || '(sin asunto)',
    date: header(d.payload?.headers, 'Date'),
    snippet: d.snippet ?? '',
    labels: d.labelIds ?? [],
    body: text,
    attachments,
    messageId: header(d.payload?.headers, 'Message-ID'),
  };
}

export function buildRaw(env: Env, to: string, subject: string, body: string, opts: { cc?: string; inReplyTo?: string; references?: string } = {}): string {
  const encSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const headers = [
    `From: ${env.OWNER_NAME || ''} <${env.OWNER_EMAIL}>`,
    `To: ${to}`,
    opts.cc ? `Cc: ${opts.cc}` : '',
    `Subject: ${encSubject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts.references ? `References: ${opts.references}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].filter((l) => l !== '');
  // La línea vacía entre las cabeceras y el contenido es obligatoria en MIME.
  // Si se elimina, Gmail acepta el borrador y muestra el asunto, pero interpreta
  // el contenido codificado como una cabecera desconocida y deja el cuerpo vacío.
  const message = `${headers.join('\r\n')}\r\n\r\n${btoa(unescape(encodeURIComponent(body)))}`;
  return base64UrlEncode(message);
}

export async function gmailDraft(env: Env, to: string, subject: string, body: string, threadId?: string, replyToId?: string): Promise<{ id: string; url: string }> {
  let inReplyTo: string | undefined;
  if (replyToId) {
    const orig = await gmailRead(env, replyToId);
    inReplyTo = orig.messageId;
    threadId = threadId || orig.threadId;
    if (!/^re:/i.test(subject)) subject = `Re: ${orig.subject}`;
  }
  const raw = buildRaw(env, to, subject, body, { inReplyTo, references: inReplyTo });
  const d = await gapi<any>(env, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { raw, threadId } }),
  });
  // Comprobación posterior: no confirmamos éxito hasta que Gmail devuelve el
  // cuerpo guardado. Protege frente a mensajes MIME aceptados pero mal formados.
  const saved = await gapi<any>(env, `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(d.id)}?format=full`);
  const savedBody = extractBody(saved.message?.payload).text.trim();
  if (body.trim() && !savedBody) {
    await gapi(env, `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(() => undefined);
    throw new Error('Gmail no conservó el cuerpo del correo. El borrador incompleto se descartó; inténtalo de nuevo.');
  }
  return { id: d.id, url: `https://mail.google.com/mail/u/0/#drafts?compose=${saved.message?.id ?? d.message?.id ?? ''}` };
}

export async function gmailSend(env: Env, to: string, subject: string, body: string, replyToId?: string): Promise<string> {
  let inReplyTo: string | undefined;
  let threadId: string | undefined;
  if (replyToId) {
    const orig = await gmailRead(env, replyToId);
    inReplyTo = orig.messageId;
    threadId = orig.threadId;
    if (!/^re:/i.test(subject)) subject = `Re: ${orig.subject}`;
  }
  const raw = buildRaw(env, to, subject, body, { inReplyTo, references: inReplyTo });
  const d = await gapi<any>(env, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw, threadId }),
  });
  return String(d.id);
}

export async function gmailModify(env: Env, id: string, add: string[] = [], remove: string[] = []): Promise<void> {
  await gapi(env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
}

export async function gmailTrash(env: Env, id: string): Promise<void> {
  await gapi(env, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/trash`, { method: 'POST' });
}

// ---------- Calendar ----------

export interface CalInfo {
  id: string;
  name: string;
  primary: boolean;
  /** Si el usuario lo tiene marcado como visible en Google Calendar. */
  selected: boolean;
  accessRole: string;
  color?: string;
}

export interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  calendarId: string;
  location?: string;
  description?: string;
  attendees?: string[];
  link?: string;
  /** Respuesta del propio usuario a la invitación, si la hay. */
  myStatus?: string;
  transparency?: 'transparent'|'opaque';
}

let calCache: { at: number; list: CalInfo[] } | null = null;

/** Todos los calendarios de la cuenta (propios y suscritos), salvo los ocultos. Se cachea 10 minutos. */
export async function calendarsList(env: Env, force = false): Promise<CalInfo[]> {
  if (!force && calCache && Date.now() - calCache.at < 10 * 60_000) return calCache.list;
  const j = await gapi<any>(env, 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=false');
  const allowed = (env.ALLOWED_CALENDARS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const list: CalInfo[] = (j.items ?? [])
    .filter((c: any) => !c.deleted && !c.hidden)
    .filter((c: any) => !allowed.length || c.primary || allowed.includes(String(c.summaryOverride || c.summary || '').toLowerCase()))
    .map((c: any) => ({
      id: String(c.id),
      name: String(c.summaryOverride || c.summary || c.id),
      primary: Boolean(c.primary),
      selected: c.selected !== false,
      accessRole: String(c.accessRole ?? ''),
      color: c.backgroundColor,
    }))
    .sort((a: CalInfo, b: CalInfo) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  calCache = { at: Date.now(), list };
  return list;
}

const evOf = (e: any, cal: { id: string; name: string }, ownerEmail?: string): CalEvent => {
  const self = (e.attendees ?? []).find((a: any) => a.self || (ownerEmail && String(a.email).toLowerCase() === ownerEmail.toLowerCase()));
  return {
    id: e.id,
    summary: e.summary ?? '(sin título)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
    calendar: cal.name,
    calendarId: cal.id,
    location: e.location,
    description: e.description,
    attendees: (e.attendees ?? []).map((a: any) => a.email),
    link: e.htmlLink,
    myStatus: self?.responseStatus,
    transparency: e.transparency === 'transparent' ? 'transparent' : 'opaque',
  };
};

async function eventsOf(env: Env, cal: { id: string; name: string }, fromIso: string, toIso: string, max: number): Promise<CalEvent[]> {
  const p = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: String(max) });
  const j = await gapi<any>(env, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${p}`);
  return (j.items ?? []).filter((e: any) => e.status !== 'cancelled').map((e: any) => evOf(e, cal, env.OWNER_EMAIL));
}

const startMs = (ev: CalEvent) => new Date(ev.allDay ? `${ev.start}T00:00:00Z` : ev.start).getTime();

/**
 * Eventos entre dos instantes. Sin `calendarId` consulta TODOS los calendarios de la cuenta y fusiona
 * el resultado (sin duplicar un mismo evento que aparezca en varios calendarios; se descartan los rechazados).
 */
export async function calendarList(env: Env, fromIso: string, toIso: string, max = 20, calendarId?: string): Promise<CalEvent[]> {
  if (calendarId) {
    const cals = await calendarsList(env).catch(() => [] as CalInfo[]);
    const cal = cals.find((c) => c.id === calendarId || (calendarId === 'primary' && c.primary)) ?? { id: calendarId, name: calendarId };
    return eventsOf(env, cal, fromIso, toIso, max);
  }
  const cals = (await calendarsList(env)).slice(0, 25);
  const perCal = await Promise.all(
    cals.map((c) =>
      eventsOf(env, c, fromIso, toIso, Math.max(max, 50)).catch((e) => {
        console.warn('calendario', c.name, e?.message);
        return [] as CalEvent[];
      }),
    ),
  );
  const seen = new Set<string>();
  const out: CalEvent[] = [];
  for (const list of perCal)
    for (const ev of list) {
      if (ev.myStatus === 'declined') continue;
      const key = `${ev.id}|${ev.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  out.sort((a, b) => startMs(a) - startMs(b) || Number(b.allDay) - Number(a.allDay));
  return out.slice(0, Math.max(max, 50));
}

const calPath = (calendarId?: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}/events`;

async function calInfo(env: Env, calendarId?: string): Promise<{ id: string; name: string }> {
  const cals = await calendarsList(env).catch(() => [] as CalInfo[]);
  const id = calendarId || 'primary';
  return cals.find((c) => c.id === id || (id === 'primary' && c.primary)) ?? { id, name: id === 'primary' ? 'Principal' : id };
}

export async function calendarCreate(
  env: Env,
  ev: { summary: string; start: string; end: string; description?: string; location?: string; attendees?: string[]; calendar_id?: string; transparency?:'transparent'|'opaque'; id?:string },
  tz: string,
): Promise<CalEvent> {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
  const body: any = {
    summary: ev.summary,
    description: ev.description,
    location: ev.location,
    start: allDay ? { date: ev.start } : { dateTime: ev.start, timeZone: tz },
    end: allDay ? { date: ev.end } : { dateTime: ev.end, timeZone: tz },
    attendees: ev.attendees?.map((email) => ({ email })),
    transparency: ev.transparency,
    id: ev.id,
  };
  const j = await gapi<any>(env, calPath(ev.calendar_id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return evOf(j, await calInfo(env, ev.calendar_id), env.OWNER_EMAIL);
}

/** PUT con ID estable: reintentar una aprobación no duplica eventos. */
export async function calendarUpsert(
  env:Env,
  ev:{id:string;summary:string;start:string;end:string;description?:string;location?:string;calendar_id:string;transparency?:'transparent'|'opaque'},
  tz:string,
):Promise<CalEvent>{
  try{return await calendarCreate(env,ev,tz)}catch(error){
    if(!String(error).includes('Google 409'))throw error;
    const j=await gapi<any>(env,`${calPath(ev.calendar_id)}/${encodeURIComponent(ev.id)}`);
    return evOf(j,await calInfo(env,ev.calendar_id),env.OWNER_EMAIL);
  }
}

export async function calendarUpdate(env: Env, id: string, patch: Record<string, unknown>, tz: string, calendarId?: string): Promise<CalEvent> {
  const body: any = { ...patch };
  delete body.calendar_id;
  if (typeof patch.start === 'string') body.start = /^\d{4}-\d{2}-\d{2}$/.test(patch.start) ? { date: patch.start } : { dateTime: patch.start, timeZone: tz };
  if (typeof patch.end === 'string') body.end = /^\d{4}-\d{2}-\d{2}$/.test(patch.end) ? { date: patch.end } : { dateTime: patch.end, timeZone: tz };
  const j = await gapi<any>(env, `${calPath(calendarId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return evOf(j, await calInfo(env, calendarId), env.OWNER_EMAIL);
}

export async function calendarDelete(env: Env, id: string, calendarId?: string): Promise<void> {
  await gapi(env, `${calPath(calendarId)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- Drive / Docs ----------

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  link?: string;
}

export async function driveSearch(env: Env, query: string, max = 10, folderId?: string): Promise<DriveFile[]> {
  const parts = ['trashed = false'];
  if (query) parts.push(`(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}')`);
  if (folderId) parts.push(`'${folderId}' in parents`);
  const p = new URLSearchParams({ q: parts.join(' and '), pageSize: String(max), orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' });
  const j = await gapi<any>(env, `https://www.googleapis.com/drive/v3/files?${p}`);
  return (j.files ?? []).map((f: any) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, link: f.webViewLink }));
}

export async function driveRead(env: Env, fileId: string): Promise<{ name: string; mimeType: string; text: string }> {
  const meta = await gapi<any>(env, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`);
  let text = '';
  if (meta.mimeType === 'application/vnd.google-apps.document')
    text = await gapi<string>(env, `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`);
  else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet')
    text = await gapi<string>(env, `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv`);
  else if (meta.mimeType === 'application/vnd.google-apps.presentation')
    text = await gapi<string>(env, `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`);
  else if (/^text\/|json|csv|xml|markdown/i.test(meta.mimeType))
    text = await gapi<string>(env, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  else text = `[Archivo binario ${meta.mimeType}. No puedo leerlo como texto.]`;
  return { name: meta.name, mimeType: meta.mimeType, text: typeof text === 'string' ? text : JSON.stringify(text) };
}

export async function driveCreateDoc(env: Env, title: string, content: string, folderId?: string): Promise<{ id: string; url: string }> {
  const f = await gapi<any>(env, 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.document', parents: folderId ? [folderId] : undefined }),
  });
  if (content)
    await gapi(env, `https://docs.googleapis.com/v1/documents/${f.id}:batchUpdate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: content } }] }),
    });
  return { id: f.id, url: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit` };
}

export async function driveAppendDoc(env: Env, docId: string, text: string): Promise<void> {
  await gapi(env, `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${text}` } }] }),
  });
}

export async function driveUploadText(env: Env, name: string, content: string, mime = 'text/plain', folderId?: string): Promise<{ id: string; url: string }> {
  const boundary = 'secretario' + Date.now();
  const meta = JSON.stringify({ name, parents: folderId ? [folderId] : undefined });
  const body = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n${content}\r\n--${boundary}--`;
  const f = await gapi<any>(env, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return { id: f.id, url: f.webViewLink };
}

export async function driveTrash(env: Env, fileId: string): Promise<void> {
  await gapi(env, `https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

export async function driveBinaryMetadata(env: Env, fileId: string): Promise<{name:string;mimeType:string;modifiedTime:string;size:string}> {
  return gapi(env, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType,modifiedTime,size`);
}

export async function driveDownloadBytes(env: Env, fileId: string): Promise<Uint8Array> {
  const token = await accessToken(env);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0,200)}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function driveUpdateBytes(env: Env, fileId: string, bytes: Uint8Array, mimeType: string): Promise<{modifiedTime:string;size:string}> {
  const token = await accessToken(env);
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=modifiedTime,size`, {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': mimeType }, body: bytes,
  });
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}

// ---------- Google Tasks ----------

export interface TaskListInfo {
  id: string;
  title: string;
}

export interface GTask {
  id: string;
  title: string;
  /** Fecha de vencimiento YYYY-MM-DD (Google Tasks no guarda la hora). */
  due?: string;
  notes?: string;
  list: string;
  listId: string;
  link?: string;
}

let taskListCache: { at: number; list: TaskListInfo[] } | null = null;

/** Todas las listas de Google Tasks. Se cachea 10 minutos. */
export async function taskLists(env: Env, force = false): Promise<TaskListInfo[]> {
  if (!force && taskListCache && Date.now() - taskListCache.at < 10 * 60_000) return taskListCache.list;
  const j = await gapi<any>(env, 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100');
  const list: TaskListInfo[] = (j.items ?? []).map((l: any) => ({ id: String(l.id), title: String(l.title) }));
  taskListCache = { at: Date.now(), list };
  return list;
}

async function resolveTaskList(env: Env, listRef?: string): Promise<TaskListInfo> {
  const lists = await taskLists(env);
  if (!listRef || listRef === '@default') {
    const def = (env.DEFAULT_TASK_LIST || '').trim().toLowerCase();
    return (def ? lists.find((l) => l.title.toLowerCase() === def) : undefined) ?? lists[0] ?? { id: '@default', title: 'Mis tareas' };
  }
  const ref = listRef.trim().toLowerCase();
  return lists.find((l) => l.id === listRef) ?? lists.find((l) => l.title.toLowerCase() === ref) ?? lists.find((l) => l.title.toLowerCase().includes(ref)) ?? lists[0] ?? { id: '@default', title: 'Mis tareas' };
}

/**
 * Tareas pendientes de TODAS las listas (o de una), ordenadas por vencimiento (las sin fecha al final).
 * `dueBefore` (YYYY-MM-DD, exclusivo) limita a las que vencen antes de esa fecha.
 */
export async function tasksList(env: Env, max = 50, opts: { listRef?: string; dueBefore?: string } = {}): Promise<GTask[]> {
  const lists = opts.listRef ? [await resolveTaskList(env, opts.listRef)] : await taskLists(env);
  const perList = await Promise.all(
    lists.map(async (l) => {
      const p = new URLSearchParams({ showCompleted: 'false', showHidden: 'false', maxResults: '100' });
      if (opts.dueBefore) p.set('dueMax', `${opts.dueBefore}T00:00:00.000Z`);
      const j = await gapi<any>(env, `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(l.id)}/tasks?${p}`).catch((e) => {
        console.warn('lista de tareas', l.title, e?.message);
        return { items: [] };
      });
      return (j.items ?? [])
        .filter((t: any) => t.status !== 'completed' && t.title)
        .map((t: any): GTask => ({ id: t.id, title: t.title, due: t.due ? String(t.due).slice(0, 10) : undefined, notes: t.notes, list: l.title, listId: l.id, link: t.webViewLink }));
    }),
  );
  const out = perList.flat();
  out.sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : a.title.localeCompare(b.title)));
  return out.slice(0, max);
}

export async function tasksCreate(env: Env, title: string, notes?: string, dueIso?: string, listRef?: string): Promise<{ id: string; list: string }> {
  const l = await resolveTaskList(env, listRef);
  const j = await gapi<any>(env, `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(l.id)}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, notes, due: dueIso }),
  });
  return { id: j.id, list: l.title };
}

export async function tasksComplete(env: Env, listId: string, id: string): Promise<void> {
  await gapi(env, `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  });
}
