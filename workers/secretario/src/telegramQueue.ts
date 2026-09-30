export type TelegramJobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TelegramJob {
  id: string;
  update: any;
  status: TelegramJobStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  leaseUntil?: number;
  completedAt?: number;
  lastError?: string;
  acknowledged?: boolean;
}

export const TELEGRAM_JOB_PREFIX = 'telegram-job:';
export const TELEGRAM_JOB_LEASE_MS = 8 * 60_000;
export const TELEGRAM_JOB_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const TELEGRAM_JOB_MAX_ATTEMPTS = 4;

/** Clave estable: Telegram reintenta con el mismo update_id si el webhook falla. */
export function telegramJobId(update: any): string {
  const explicit = Number(update?.update_id);
  if (Number.isFinite(explicit)) return String(explicit);
  const message = update?.message ?? update?.callback_query?.message;
  const chat = message?.chat?.id ?? update?.callback_query?.from?.id ?? 'unknown';
  const messageId = message?.message_id ?? update?.callback_query?.id ?? 'unknown';
  return `${chat}:${messageId}`;
}

/** Los trabajos con archivos, Drive o análisis profundos reciben acuse inmediato. */
export function isLongTelegramUpdate(update: any): boolean {
  const message = update?.message;
  if (!message || update?.callback_query) return false;
  if (message.document || message.photo?.length || message.voice || message.audio || message.video_note) return true;
  const text = String(message.text ?? message.caption ?? '');
  return /\b(drive|carpeta|subcarpeta|pdf|transcripci[oó]n|analiz|informe|documento|cuadro\s+de\s+mando|planificaci[oó]n)\w*/i.test(text);
}

export function telegramRetryDelayMs(attempt: number): number {
  return Math.min(10 * 60_000, 15_000 * Math.max(1, 2 ** Math.max(0, attempt - 1)));
}

export function telegramJobDue(job: TelegramJob, at = Date.now()): boolean {
  if (job.status === 'pending') return job.nextAttemptAt <= at;
  return job.status === 'running' && Number(job.leaseUntil || 0) <= at;
}
