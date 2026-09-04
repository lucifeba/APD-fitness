import { runCode } from '../sandbox';
import { addDays, clip, localParts, localTime } from '../util';
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
    run: async (_a, ctx) => {
      const p = localParts(ctx.tz);
      return { local: localTime(ctx.tz), date: p.date, time: p.time, weekday: p.weekday, offset: p.offset, tomorrow: addDays(p.date, 1), utc: new Date().toISOString(), timezone: ctx.tz };
    },
  },
  {
    def: {
      name: 'run_code',
      description:
        'Ejecuta JavaScript moderno en un sandbox aislado dentro del Worker (sin red ni acceso a archivos; 5 s y 48 MB). Úsalo para cálculos, estadísticas, transformar o cruzar datos, parsear textos o generar tablas/CSV que ninguna herramienta ni API resuelva. Los datos de entrada llegan en la variable global `input` (pásalos en el parámetro input). Devuelve el valor de `return` (objeto, array, número o texto) y las trazas de console.log. Para llamar a APIs usa antes http_request y pasa aquí la respuesta como input.',
      parameters: params(
        {
          code: str('Código JavaScript. Termina con `return <resultado>`. Sin import/require, sin fetch, sin async.'),
          input: { type: 'object', description: 'Datos de entrada, accesibles como `input` (cualquier JSON).' },
        },
        ['code'],
      ),
    },
    run: async (a) => {
      const r = await runCode(String(a.code), a.input ?? null);
      const out: Record<string, unknown> = { ok: r.ok, ms: r.ms };
      if (r.ok) out.result = typeof r.result === 'string' ? clip(r.result, 12000) : JSON.parse(clip(JSON.stringify(r.result ?? null), 12000).replace(/…\[recortado \d+ caracteres\]$/, '') || 'null');
      else out.error = r.error;
      if (r.logs.length) out.logs = r.logs.slice(-40);
      return out;
    },
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
