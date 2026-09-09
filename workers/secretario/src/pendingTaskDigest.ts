import type { Env } from './env';
import { tasksCreate, tasksList, type GTask } from './google';

export const PENDING_DIGEST_MARKER = '[ARAVITAS:PENDIENTES]';

export interface PendingDigest {
  title: string;
  notes: string;
  dueIso: string;
  count: number;
}

/** Construye una única tarea de fecha completa con las tareas vencidas reales. */
export function buildPendingDigest(tasks: GTask[], sourceDate: string, dueDate: string): PendingDigest | null {
  const pending = tasks.filter(
    (task) =>
      task.title.trim() &&
      !task.title.toLowerCase().startsWith('pendientes por completar') &&
      !(task.notes || '').includes(PENDING_DIGEST_MARKER),
  );
  if (!pending.length) return null;
  const lines = pending.map(
    (task, index) =>
      `${index + 1}. ${task.title.trim()}${task.list ? ` · Lista: ${task.list}` : ''}${task.due ? ` · Vencía: ${task.due}` : ''}`,
  );
  return {
    title: `Pendientes por completar (${pending.length})`,
    notes: `${PENDING_DIGEST_MARKER}:${sourceDate}\nResumen automático de Aravitas de las tareas que siguen pendientes.\n\n${lines.join('\n')}`,
    dueIso: `${dueDate}T00:00:00.000Z`,
    count: pending.length,
  };
}

/** Crea el resumen una sola vez en la lista predeterminada (Araceli en producción). */
export async function ensurePendingDigestTask(
  env: Env,
  overdue: GTask[],
  sourceDate: string,
  dueDate: string,
): Promise<{ created: boolean; count: number; list?: string }> {
  const digest = buildPendingDigest(overdue, sourceDate, dueDate);
  if (!digest) return { created: false, count: 0 };
  const listRef = env.DEFAULT_TASK_LIST || 'Araceli';
  const existing = await tasksList(env, 200, { listRef });
  if (
    existing.some(
      (task) => task.due === dueDate && (task.notes || '').includes(`${PENDING_DIGEST_MARKER}:${sourceDate}`),
    )
  )
    return { created: false, count: digest.count, list: listRef };
  const created = await tasksCreate(env, digest.title, digest.notes, digest.dueIso, listRef);
  return { created: true, count: digest.count, list: created.list };
}
