import { nextCron, now, uid } from '../util';
import { confirm, params, str, num, type ToolSpec } from './types';

export const scheduleTools: ToolSpec[] = [
  {
    def: {
      name: 'schedule_task',
      description:
        'Programa un recordatorio o una tarea que ejecutarás tú mismo más tarde (p. ej. "cada lunes a las 8 resume los correos de la semana"). Para una sola vez usa "when"; para repetir usa "cron" (5 campos, en hora UTC).',
      parameters: params(
        {
          instruction: str('Qué hacer o recordar, redactado para que tu yo futuro lo entienda sin contexto.'),
          when: str('Fecha y hora ISO 8601 con zona horaria para una sola ejecución, p. ej. 2026-09-04T09:00:00+02:00'),
          cron: str('Expresión cron de 5 campos en UTC para tareas recurrentes, p. ej. "0 6 * * 1" (lunes 06:00 UTC = 08:00 Madrid en verano).'),
          kind: str('reminder = solo avisar con el texto; agent = ejecutar la instrucción con todas tus herramientas y enviar el resultado.', { enum: ['reminder', 'agent'] }),
        },
        ['instruction'],
      ),
    },
    run: async (a, ctx) => {
      let due: Date | null = null;
      if (a.cron) due = nextCron(String(a.cron));
      else if (a.when) due = new Date(String(a.when));
      if (!due || Number.isNaN(due.getTime())) return { error: 'Fecha o cron inválidos.' };
      if (due.getTime() < Date.now() - 60_000) return { error: 'La fecha está en el pasado.' };
      const id = uid('t_');
      await ctx.env.DB.prepare('INSERT INTO tasks(id,chat_id,kind,instruction,due_at,cron,status,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(id, ctx.chatId, String(a.kind || 'reminder'), String(a.instruction), due.toISOString(), a.cron ? String(a.cron) : null, 'pending', now())
        .run();
      await ctx.onTasksChanged();
      return { id, due_at_utc: due.toISOString(), recurring: Boolean(a.cron) };
    },
  },
  {
    def: {
      name: 'list_tasks',
      description: 'Lista las tareas y recordatorios programados.',
      parameters: params({ include_done: { type: 'boolean', description: 'Incluir terminadas.' } }),
    },
    run: async (a, ctx) =>
      (
        await ctx.env.DB.prepare(`SELECT id,kind,instruction,due_at,cron,status,last_run_at FROM tasks WHERE chat_id=? ${a.include_done ? '' : "AND status='pending'"} ORDER BY due_at LIMIT 50`)
          .bind(ctx.chatId)
          .all()
      ).results,
  },
  {
    def: {
      name: 'cancel_task',
      description: 'Cancela una tarea programada. Requiere confirmación del usuario.',
      parameters: params({ id: str('Id de la tarea (t_...)'), instruction: str('Texto de la tarea, para la confirmación.') }, ['id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Cancelar la tarea "${a.instruction ?? a.id}"`);
      const r = await ctx.env.DB.prepare("UPDATE tasks SET status='cancelled' WHERE id=? AND chat_id=? AND status='pending'").bind(String(a.id), ctx.chatId).run();
      await ctx.onTasksChanged();
      return { cancelled: r.meta.changes > 0 };
    },
  },
];
