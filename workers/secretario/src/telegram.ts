import type { Env } from './env';

type Json = Record<string, unknown>;

export async function tg<T = any>(env: Env, method: string, body?: Json): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json<any>();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
  return j.result as T;
}

export async function typing(env: Env, chatId: string): Promise<void> {
  try {
    await tg(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch {
    /* no importa */
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Marcadores de uso privado (Unicode PUA) para reservar los bloques de código: no aparecen en texto normal.
const MARK_OPEN = '';
const MARK_CLOSE = '';

/** Tabla Markdown → texto monoespaciado con columnas alineadas (dentro de un bloque de código). */
function tableToPre(block: string): string {
  const rows = block
    .trim()
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim().replace(/\*\*|__|`/g, '')),
    )
    .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  if (!rows.length) return block;
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_v, i) => Math.min(28, Math.max(...rows.map((r) => (r[i] ?? '').length))));
  const line = (cells: string[]) => cells.map((c, i) => c.slice(0, widths[i]).padEnd(widths[i])).join('  ').trimEnd();
  const out = [line(rows[0])];
  if (rows.length > 1) out.push(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows.slice(1)) out.push(line(r));
  return '```\n' + out.join('\n') + '\n```';
}

/** Convierte Markdown básico (lo que suelen escribir los modelos) a HTML de Telegram. */
export function mdToHtml(md: string): string {
  const blocks: string[] = [];
  // Telegram no pinta tablas Markdown: las pasamos a bloque monoespaciado alineado.
  md = md.replace(/(?:^|\n)((?:[ \t]*\|[^\n]*\|[ \t]*(?:\n|$)){2,})/g, (m, table) => m.replace(table, `${tableToPre(table)}\n`));
  let text = md.replace(/[]/g, '').replace(/```(\w+)?\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    blocks.push(`<pre>${escapeHtml(String(code).replace(/\n$/, ''))}</pre>`);
    return `${MARK_OPEN}${blocks.length - 1}${MARK_CLOSE}`;
  });
  text = escapeHtml(text);
  text = text
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/(\d+)/g, (_m, i) => blocks[Number(i)] ?? '');
  return text;
}

function chunk(text: string, max = 3900): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

export interface SendOpts {
  replyTo?: number;
  keyboard?: { text: string; data: string }[][];
  plain?: boolean;
}

export async function send(env: Env, chatId: string, text: string, opts: SendOpts = {}): Promise<number | undefined> {
  if (!text?.trim()) return undefined;
  let lastId: number | undefined;
  // Las etiquetas HTML alargan el texto (**x** → <b>x</b>), así que troceamos con margen para no pasar de 4096.
  const parts = chunk(text, opts.plain ? 3900 : 2900);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const body: Json = { chat_id: chatId, text: opts.plain ? parts[i] : mdToHtml(parts[i]), disable_web_page_preview: true };
    if (!opts.plain) body.parse_mode = 'HTML';
    if (opts.replyTo && i === 0) body.reply_parameters = { message_id: opts.replyTo, allow_sending_without_reply: true };
    if (last && opts.keyboard)
      body.reply_markup = { inline_keyboard: opts.keyboard.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) };
    try {
      const m = await tg<{ message_id: number }>(env, 'sendMessage', body);
      lastId = m.message_id;
    } catch (e: any) {
      // El HTML generado puede no gustarle a Telegram. Reintento en texto plano sin marcas de Markdown.
      console.warn('telegram html', String(e?.message ?? e).slice(0, 200));
      const m = await tg<{ message_id: number }>(env, 'sendMessage', { ...body, text: stripMd(parts[i]), parse_mode: undefined });
      lastId = m.message_id;
    }
  }
  return lastId;
}

/** Quita las marcas de Markdown para un envío en texto plano. */
function stripMd(md: string): string {
  return md
    .replace(/```(\w+)?\n?([\s\S]*?)```/g, '$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)');
}

export async function clearKeyboard(env: Env, chatId: string, messageId: number): Promise<void> {
  try {
    await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
  } catch {
    /* mensaje ya editado o demasiado antiguo */
  }
}

export async function answerCallback(env: Env, id: string, text?: string): Promise<void> {
  try {
    await tg(env, 'answerCallbackQuery', { callback_query_id: id, text });
  } catch {
    /* ignorar */
  }
}

export async function downloadFile(env: Env, fileId: string): Promise<{ bytes: ArrayBuffer; path: string }> {
  const f = await tg<{ file_path: string }>(env, 'getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error(`Telegram descarga ${r.status}`);
  return { bytes: await r.arrayBuffer(), path: f.file_path };
}

export async function sendDocument(env: Env, chatId: string, name: string, content: string, caption?: string): Promise<void> {
  const form = new FormData();
  form.set('chat_id', chatId);
  if (caption) form.set('caption', caption.slice(0, 1000));
  form.set('document', new Blob([content], { type: 'text/plain' }), name);
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Telegram sendDocument ${r.status}`);
}
