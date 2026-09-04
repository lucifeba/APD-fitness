import type { Env } from './env';
import { calendarList, calendarsList, tasksList, type CalEvent, type CalInfo, type GTask } from './google';
import { addDays, dayRange, localClock, localParts, longDate } from './util';

export interface AgendaDay {
  date: string;
  events: CalEvent[];
  /** Tareas de Google Tasks que vencen ese día. */
  tasks: GTask[];
}

export interface Agenda {
  from: string;
  to: string;
  days: AgendaDay[];
  /** Tareas vencidas antes del primer día y aún pendientes. */
  overdue: GTask[];
  /** Tareas pendientes sin fecha. */
  undated: GTask[];
  calendars: CalInfo[];
  warnings: string[];
}

/** Fecha local YYYY-MM-DD en la que empieza un evento. */
function eventDay(ev: CalEvent, tz: string): string {
  return ev.allDay ? ev.start : localParts(tz, new Date(ev.start)).date;
}

/** Reúne eventos de todos los calendarios y tareas de todas las listas para `days` días desde `fromYmd`. */
export async function buildAgenda(env: Env, tz: string, fromYmd: string, days = 1): Promise<Agenda> {
  const n = Math.min(Math.max(1, days), 31);
  const { fromIso, toIso } = dayRange(tz, fromYmd, n);
  const toYmd = addDays(fromYmd, n);
  const warnings: string[] = [];
  const [calendars, events, tasks] = await Promise.all([
    calendarsList(env).catch((e) => {
      warnings.push(`No pude listar los calendarios: ${e?.message}`);
      return [] as CalInfo[];
    }),
    calendarList(env, fromIso, toIso, 300).catch((e) => {
      warnings.push(`No pude leer el calendario: ${e?.message}`);
      return [] as CalEvent[];
    }),
    tasksList(env, 200).catch((e) => {
      warnings.push(`No pude leer Google Tasks: ${e?.message}`);
      return [] as GTask[];
    }),
  ]);
  const byDay = new Map<string, AgendaDay>();
  for (let i = 0; i < n; i++) {
    const d = addDays(fromYmd, i);
    byDay.set(d, { date: d, events: [], tasks: [] });
  }
  for (const ev of events) {
    if (ev.allDay) {
      // Un evento de varios días aparece cada día que cubre dentro del rango.
      for (let d = ev.start; d < ev.end; d = addDays(d, 1)) byDay.get(d)?.events.push(ev);
    } else byDay.get(eventDay(ev, tz))?.events.push(ev);
  }
  const overdue: GTask[] = [];
  const undated: GTask[] = [];
  for (const t of tasks) {
    if (!t.due) undated.push(t);
    else if (t.due < fromYmd) overdue.push(t);
    else if (t.due < toYmd) byDay.get(t.due)?.tasks.push(t);
  }
  return { from: fromYmd, to: toYmd, days: [...byDay.values()], overdue, undated, calendars, warnings };
}

// ---------- Análisis: carga, solapamientos, huecos ----------

interface Slot {
  ev: CalEvent;
  start: number;
  end: number;
}

interface DayStats {
  slots: Slot[];
  busyMin: number;
  conflicts: [CalEvent, CalEvent][];
  /** Semáforo del día. */
  level: 'green' | 'yellow' | 'red';
  label: string;
}

const MIN = 60_000;

function timedSlots(day: AgendaDay, tz: string): Slot[] {
  const { fromIso, toIso } = dayRange(tz, day.date, 1);
  const dayStart = new Date(fromIso).getTime();
  const dayEnd = new Date(toIso).getTime();
  return day.events
    .filter((ev) => !ev.allDay)
    .map((ev) => ({ ev, start: Math.max(dayStart, new Date(ev.start).getTime()), end: Math.min(dayEnd, new Date(ev.end).getTime()) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

function analyzeDay(day: AgendaDay, tz: string): DayStats {
  const slots = timedSlots(day, tz);
  // Minutos ocupados = unión de intervalos (los solapados no cuentan dos veces).
  let busy = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const s of slots) {
    if (s.start > curEnd) {
      if (curEnd > curStart) busy += curEnd - curStart;
      curStart = s.start;
      curEnd = s.end;
    } else curEnd = Math.max(curEnd, s.end);
  }
  if (curEnd > curStart) busy += curEnd - curStart;
  const conflicts: [CalEvent, CalEvent][] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      if (slots[j].start >= slots[i].end) break;
      // Dos eventos con el mismo título en calendarios distintos son el mismo compromiso duplicado, no un conflicto.
      if (slots[i].ev.summary.trim().toLowerCase() === slots[j].ev.summary.trim().toLowerCase()) continue;
      conflicts.push([slots[i].ev, slots[j].ev]);
    }
  const busyMin = Math.round(busy / MIN);
  const n = day.events.length;
  let level: DayStats['level'] = 'green';
  let label = 'Día tranquilo';
  if (conflicts.length || busyMin >= 7 * 60 || n >= 9) {
    level = 'red';
    label = conflicts.length ? 'Ojo, hay solapamientos' : 'Día cargado';
  } else if (busyMin >= 4 * 60 || n >= 6) {
    level = 'yellow';
    label = 'Día movido';
  }
  return { slots, busyMin, conflicts, level, label };
}

/** Huecos libres de al menos `minGap` minutos entre las 07:00 y las 22:00 (o desde ahora si es hoy). */
function freeSlots(day: AgendaDay, stats: DayStats, tz: string, minGap = 45): string[] {
  const { fromIso } = dayRange(tz, day.date, 1);
  const base = new Date(fromIso).getTime();
  let cursor = base + 7 * 60 * MIN;
  const limit = base + 22 * 60 * MIN;
  if (day.date === localParts(tz).date) cursor = Math.max(cursor, Math.ceil(Date.now() / (15 * MIN)) * 15 * MIN);
  const out: string[] = [];
  const clock = (ms: number) => localClock(tz, new Date(ms).toISOString());
  for (const s of stats.slots) {
    if (s.start - cursor >= minGap * MIN && cursor < limit) out.push(`${clock(cursor)}–${clock(Math.min(s.start, limit))}`);
    cursor = Math.max(cursor, s.end);
  }
  if (limit - cursor >= minGap * MIN) out.push(`${clock(cursor)}–${clock(limit)}`);
  return out;
}

// ---------- Presentación ----------

/** Cuadrados de color (los círculos quedan para el semáforo). Orden de preferencia cuando hay que buscar uno libre. */
const SQUARES: { emoji: string; hue: number }[] = [
  { emoji: '🟥', hue: 0 },
  { emoji: '🟧', hue: 30 },
  { emoji: '🟨', hue: 55 },
  { emoji: '🟩', hue: 130 },
  { emoji: '🟦', hue: 215 },
  { emoji: '🟪', hue: 280 },
];
const NEUTRAL = ['🟫', '⬛', '⬜'];

/** Tono (0-360) y luminosidad/saturación de un color hex; null si no es un color válido. */
function hsl(hex?: string): { h: number; s: number; l: number } | null {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return null;
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

/**
 * Asigna a cada calendario un cuadrado de color parecido al que tiene en Google, sin repetir
 * mientras queden colores libres, para reconocerlos de un vistazo.
 */
function assignSquares(calendars: CalInfo[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  const pick = (candidates: string[]): string => {
    const free = candidates.find((c) => !taken.has(c)) ?? candidates[0];
    taken.add(free);
    return free;
  };
  for (const c of calendars) {
    const col = hsl(c.color);
    let candidates: string[];
    if (!col) candidates = [...NEUTRAL, ...SQUARES.map((s) => s.emoji)];
    else if (col.s < 0.18) candidates = [col.l < 0.35 ? '⬛' : '⬜', '🟫', ...SQUARES.map((s) => s.emoji)];
    else {
      const ranked = [...SQUARES].sort((a, b) => {
        const da = Math.min(Math.abs(a.hue - col.h), 360 - Math.abs(a.hue - col.h));
        const db = Math.min(Math.abs(b.hue - col.h), 360 - Math.abs(b.hue - col.h));
        return da - db;
      });
      candidates = ranked.map((s) => s.emoji);
      if (col.l < 0.3 && col.h < 40) candidates.unshift('🟫');
      candidates.push(...NEUTRAL);
    }
    out.set(c.id, pick(candidates));
  }
  return out;
}

const cleanLoc = (s?: string) => (s ? s.split('\n')[0].trim().slice(0, 50) : '');
const PRIORITY = /(^|[^\p{L}])(urgente|importante|prioridad|deadline|entrega|vence|examen|vuelo|tren)(?![\p{L}])|🔴|‼️|❗/iu;
const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

function eventLine(ev: CalEvent, tz: string, circle: string, conflict: boolean): string {
  const when = ev.allDay ? 'Todo el día' : `${localClock(tz, ev.start)}–${localClock(tz, ev.end)}`;
  const title = ev.summary.trim();
  const others = (ev.attendees ?? []).length;
  const flags: string[] = [];
  if (conflict) flags.push('⚠️');
  if (PRIORITY.test(title) && !/🔴|‼️|❗/.test(title)) flags.push('‼️');
  if (cleanLoc(ev.location)) flags.push(`📍 ${cleanLoc(ev.location)}`);
  if (others >= 2) flags.push(`👥 ${others}`);
  if (ev.myStatus === 'needsAction') flags.push('✉️ sin responder');
  else if (ev.myStatus === 'tentative') flags.push('❔ quizá');
  const tail = flags.length ? ` ${flags.join(' ')}` : '';
  return ev.allDay ? `${circle} ${when} · ${title} _(${ev.calendar})_${tail}` : `${circle} **${when}** · ${title} _(${ev.calendar})_${tail}`;
}

const taskLine = (t: GTask, showList: boolean) => `• ${t.title}${showList ? ` _(${t.list})_` : ''}`;
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Texto en Markdown (el que entiende `send` de Telegram) con la agenda completa, semáforo, solapamientos y huecos. */
export function renderAgenda(a: Agenda, tz: string): string {
  const today = localParts(tz).date;
  const single = a.days.length === 1;
  const circles = assignSquares(a.calendars);
  const usedCalendars = new Map<string, string>();
  const allTasks = [...a.overdue, ...a.undated, ...a.days.flatMap((d) => d.tasks)];
  const showList = new Set(allTasks.map((t) => t.listId)).size > 1;
  const out: string[] = [];
  let weekEvents = 0;
  let weekBusy = 0;
  let heaviest: { date: string; busy: number } | null = null;

  for (const day of a.days) {
    const stats = analyzeDay(day, tz);
    const conflictIds = new Set(stats.conflicts.flat().map((e) => e.id));
    const label = day.date === today ? 'Hoy' : day.date === addDays(today, 1) ? 'Mañana' : day.date === addDays(today, -1) ? 'Ayer' : '';
    out.push(`📅 **${label ? `${label} · ` : ''}${longDate(day.date, day.date.slice(0, 4) !== today.slice(0, 4))}**`);
    const light = stats.level === 'red' ? '🔴' : stats.level === 'yellow' ? '🟡' : '🟢';
    const bits = [`${day.events.length} ${day.events.length === 1 ? 'evento' : 'eventos'}`];
    if (stats.busyMin) bits.push(`${fmtDur(stats.busyMin)} ocupadas`);
    if (stats.conflicts.length) bits.push(`${stats.conflicts.length} ${stats.conflicts.length === 1 ? 'solapamiento' : 'solapamientos'}`);
    if (day.tasks.length) bits.push(`${day.tasks.length} ${day.tasks.length === 1 ? 'tarea' : 'tareas'}`);
    out.push(day.events.length ? `${light} ${stats.label} · ${bits.join(' · ')}` : '🟢 Sin eventos en ningún calendario');
    if (day.events.length) out.push('');
    // Los de todo el día primero, luego los de hora, separados por una línea en blanco.
    const allDayEvs = day.events.filter((e) => e.allDay);
    const timedEvs = day.events.filter((e) => !e.allDay);
    for (const ev of allDayEvs) {
      usedCalendars.set(ev.calendarId, ev.calendar);
      out.push(eventLine(ev, tz, circles.get(ev.calendarId) ?? '⬜', false));
    }
    if (allDayEvs.length && timedEvs.length) out.push('');
    for (const ev of timedEvs) {
      usedCalendars.set(ev.calendarId, ev.calendar);
      out.push(eventLine(ev, tz, circles.get(ev.calendarId) ?? '⬜', conflictIds.has(ev.id)));
    }
    if (stats.conflicts.length) out.push('');
    for (const [x, y] of stats.conflicts)
      out.push(`⚠️ Se solapan: ${x.summary.trim()} (${localClock(tz, x.start)}–${localClock(tz, x.end)}) y ${y.summary.trim()} (${localClock(tz, y.start)}–${localClock(tz, y.end)})`);
    if (day.tasks.length) {
      out.push('');
      out.push(`✅ **Tareas que vencen${single ? '' : ' este día'}**`);
      for (const t of day.tasks) out.push(taskLine(t, showList));
    }
    if (single) {
      const free = freeSlots(day, stats, tz);
      if (free.length && day.events.length) {
        out.push('');
        out.push(`🕓 Huecos libres: ${free.join(', ')}`);
      }
    }
    out.push('');
    if (!single) out.push('');
    weekEvents += day.events.length;
    weekBusy += stats.busyMin;
    if (!heaviest || stats.busyMin > heaviest.busy) heaviest = { date: day.date, busy: stats.busyMin };
  }

  if (!single && weekEvents) {
    const h = heaviest && heaviest.busy ? ` · día más cargado: ${longDate(heaviest.date, false)} (${fmtDur(heaviest.busy)})` : '';
    out.push(`📊 **Resumen** · ${weekEvents} eventos · ${fmtDur(weekBusy)} ocupadas${h}`);
    out.push('');
  }
  if (a.overdue.length) {
    out.push(`🔴 **Tareas vencidas** (${a.overdue.length})`);
    for (const t of a.overdue.slice(0, 12)) out.push(`• ${t.title}${showList ? ` _(${t.list})_` : ''} · desde el ${ddmm(t.due!)}`);
    if (a.overdue.length > 12) out.push(`… y ${a.overdue.length - 12} más`);
    out.push('');
  }
  if (single && a.undated.length) {
    out.push(`⚪ **Pendientes sin fecha** (${a.undated.length})`);
    for (const t of a.undated.slice(0, 8)) out.push(taskLine(t, showList));
    if (a.undated.length > 8) out.push(`… y ${a.undated.length - 8} más`);
    out.push('');
  }
  if (usedCalendars.size) out.push(`_${[...usedCalendars].map(([id, name]) => `${circles.get(id) ?? '⬜'} ${name}`).join(' · ')}_`);
  else if (a.calendars.length) out.push(`_He mirado ${a.calendars.length} calendarios: ${a.calendars.map((c) => c.name).join(', ')}._`);
  for (const w of a.warnings) out.push(`⚠️ ${w}`);
  return out.join('\n').trim();
}
