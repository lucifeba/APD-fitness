import { localTime } from '../util';
import { params, str, type ToolSpec } from './types';

export const systemTools: ToolSpec[] = [
  {
    def: {
      name: 'think',
      description:
        'Cuaderno de razonamiento privado. Úsalo antes de tareas complejas para planificar pasos, o para autoevaluar un resultado antes de responder. El usuario no lo ve.',
      parameters: params({ thought: str('Plan, hipótesis, autocrítica o comprobación.') }, ['thought']),
    },
    run: async (a) => ({ noted: true, length: String(a.thought).length }),
  },
  {
    def: {
      name: 'subtask',
      description:
        'Delega una subtarea acotada a un subagente con contexto limpio y todas las herramientas (investigar un tema, leer varios correos y resumir...). Devuelve su informe. Úsalo para dividir trabajos grandes.',
      parameters: params({ goal: str('Objetivo completo y autocontenido, con el formato de salida esperado.'), tier: str('smart o fast', { enum: ['smart', 'fast'] }) }, ['goal']),
    },
    run: async (a, ctx) => {
      if (ctx.depth >= 1) return { error: 'Ya estás en una subtarea; resuélvelo directamente.' };
      return { report: await ctx.runSubagent(String(a.goal), a.tier === 'fast' ? 'fast' : 'smart') };
    },
  },
  {
    def: {
      name: 'get_time',
      description: 'Devuelve la fecha y hora actual local y en UTC.',
      parameters: params({}),
    },
    run: async (_a, ctx) => ({ local: localTime(ctx.tz), utc: new Date().toISOString(), timezone: ctx.tz }),
  },
  {
    def: {
      name: 'send_file',
      description: 'Envía al usuario un archivo de texto por Telegram (informes largos, csv, markdown, código).',
      parameters: params({ name: str('Nombre con extensión, p. ej. informe.md'), content: str('Contenido.'), caption: str('Opcional: texto breve que acompaña al archivo.') }, ['name', 'content']),
    },
    run: async (a, ctx) => {
      await ctx.sendFile(String(a.name), String(a.content), a.caption ? String(a.caption) : undefined);
      return { sent: true };
    },
  },
];
