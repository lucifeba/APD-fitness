import { receipt } from './db';
import type { Env } from './env';
import { calendarList, googleConfigured, tasksList, type CalEvent, type GTask } from './google';
import { addDays, dayRange, localClock, localParts, now, uid } from './util';

/**
 * Avisos automáticos por Telegram: N minutos antes de cada evento con hora (todos los calendarios)
 * y de cada tarea de Google Tasks con hora en sus notas; y un repaso a primera hora con las tareas
 * del día que no tienen hora. Se programan como filas `tasks` (kind=reminder) que dispara la alarma
 * del Durable Object, con recibos para no repetir.
 */

const MIN = 60_000;
const LOOKAHEAD_MS = 3 * 60 * MIN;

export function remindMinutes(env: Env): number {
  const n = Number(env.REMIND_MINUTES ?? '15');
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

/** Hora HH:MM que el usuario dejó en las notas de una tarea (p. ej. "Hora: 17:00" o "a las 17:00"). */
export function taskTime(t: GTask): string | null {
  const m = (t.notes || '').match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

async function schedule(env: Env, chatId: string, dueMs: number, text: string): Promise<void> {
  const due = new Date(Math.max(dueMs, Date.now() + 5_000)).toISOString();
  await env.DB.prepare('INSERT INTO tasks(id,chat_id,kind,instruction,due_at,cron,status,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(uid('r_'), chatId, 'reminder', text, due, null, 'pending', now())
    .run();
}

function eventText(ev: CalEvent, tz: string, minutes: number): string {
  const loc = ev.location ? ` · 📍 ${ev.location.split('\n')[0].slice(0, 60)}` : '';
  return `En ${minutes} min: ${ev.summary.trim()} (${localClock(tz, ev.start)}–${localClock(tz, ev.end)})${loc} · ${ev.calendar}`;
}

/** Programa los avisos pendientes de las próximas horas. Devuelve cuántos ha creado. */
export async function syncReminders(env: Env, chatId: string, tz: string): Promise<number> {
  const minutes = remindMinutes(env);
  if (!minutes || !(await googleConfigured(env))) return 0;
  const nowMs = Date.now();
  let created = 0;

  // Eventos con hora en las próximas horas, en todos los calendarios.
  try {
    const events = await calendarList(env, new Date(nowMs).toISOString(), new Date(nowMs + LOOKAHEAD_MS).toISOString(), 100);
    for (const ev of events) {
      if (ev.allDay || ev.myStatus === 'declined') continue;
      const start = new Date(ev.start).getTime();
      if (start <= nowMs) continue;
      if (!(await receipt(env, `rem:ev:${ev.id}:${ev.start}`))) continue;
      await schedule(env, chatId, start - minutes * MIN, eventText(ev, tz, minutes));
      created++;
    }
  } catch (e: any) {
    console.warn('avisos de eventos', e?.message);
  }

  // Tareas de Google Tasks que vencen hoy: con hora → aviso exacto; sin hora → repaso a primera hora.
  try {
    const p = localParts(tz);
    const tasks = await tasksList(env, 200, { dueBefore: addDays(p.date, 1) });
    const today = tasks.filter((t) => t.due === p.date);
    const { fromIso } = dayRange(tz, p.date, 1);
    const dayStart = new Date(fromIso).getTime();
    const untimed: GTask[] = [];
    for (const t of today) {
      const time = taskTime(t);
      if (!time) {
        untimed.push(t);
        continue;
      }
      const [h, m] = time.split(':').map(Number);
      const at = dayStart + (h * 60 + m) * MIN;
      if (at <= nowMs) continue;
      if (!(await receipt(env, `rem:task:${t.id}:${t.due}:${time}`))) continue;
      await schedule(env, chatId, at - minutes * MIN, `En ${minutes} min: ${t.title} (${time}) · tarea de la lista ${t.list}`);
      created++;
    }
    const digest = (env.TASKS_DIGEST_TIME || '08:45').match(/^(\d{1,2}):(\d{2})$/);
    if (untimed.length && digest) {
      const at = dayStart + (Number(digest[1]) * 60 + Number(digest[2])) * MIN;
      if (at > nowMs && (await receipt(env, `rem:tasks-day:${p.date}`))) {
        await schedule(env, chatId, at, `Tareas para hoy (${untimed.length}):\n${untimed.map((t) => `• ${t.title}${t.list ? ` · ${t.list}` : ''}`).join('\n')}`);
        created++;
      }
    }
  } catch (e: any) {
    console.warn('avisos de tareas', e?.message);
  }
  return created;
}
