export const now = () => new Date().toISOString();
export const today = () => now().slice(0, 10);
export const uid = (prefix = '') => `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

export function clip(text: string, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…[recortado ${text.length - max} caracteres]`;
}

export function safeJson<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export function localTime(tz: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function localHour(tz: string, date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date);
    return Number(h) % 24;
  } catch {
    return date.getUTCHours();
  }
}

export function inQuietHours(spec: string | undefined, tz: string): boolean {
  if (!spec) return false;
  const m = spec.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const h = localHour(tz);
  return start > end ? h >= start || h < end : h >= start && h < end;
}

/** Calcula la siguiente ejecución de un cron de 5 campos (min hora dia mes dow) en UTC. */
export function nextCron(expr: string, from = new Date()): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const parse = (p: string, min: number, max: number): Set<number> | null => {
    const out = new Set<number>();
    for (const piece of p.split(',')) {
      const m = piece.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
      if (!m) return null;
      const step = m[3] ? Number(m[3]) : 1;
      let lo = m[1] === '*' ? min : Number(m[1]);
      let hi = m[1] === '*' ? max : m[2] ? Number(m[2]) : Number(m[1]);
      if (m[1] === '*' && !m[2]) hi = max;
      if (m[3] && !m[2] && m[1] !== '*') hi = max;
      for (let v = lo; v <= hi; v += step) out.add(v);
    }
    return out;
  };
  const mins = parse(parts[0], 0, 59);
  const hours = parse(parts[1], 0, 23);
  const doms = parse(parts[2], 1, 31);
  const months = parse(parts[3], 1, 12);
  const dows = parse(parts[4], 0, 6);
  if (!mins || !hours || !doms || !months || !dows) return null;
  const d = new Date(from.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      months.has(d.getUTCMonth() + 1) &&
      doms.has(d.getUTCDate()) &&
      dows.has(d.getUTCDay()) &&
      hours.has(d.getUTCHours()) &&
      mins.has(d.getUTCMinutes())
    )
      return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return null;
}
