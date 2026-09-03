import { archiveMemory, listMemories, recall, remember } from '../memory';
import { now } from '../util';
import { confirm, params, str, num, type ToolSpec } from './types';

export const memoryTools: ToolSpec[] = [
  {
    def: {
      name: 'memory_search',
      description: 'Busca en tu memoria a largo plazo (hechos, preferencias, personas, proyectos, episodios pasados).',
      parameters: params({ query: str('Qué quieres recordar.'), k: num('Número de recuerdos, por defecto 6.') }, ['query']),
    },
    run: async (a, ctx) => (await recall(ctx.env, String(a.query), Number(a.k) || 6)).map((m) => ({ id: m.id, kind: m.kind, content: m.content, fecha: m.created_at.slice(0, 10) })),
  },
  {
    def: {
      name: 'memory_save',
      description: 'Guarda un hecho duradero en memoria a largo plazo. Solo para información estable y útil en el futuro, no para charla pasajera.',
      parameters: params(
        {
          content: str('El hecho, en una frase completa y autocontenida, en español.'),
          kind: str('fact | preference | person | project | lesson', { enum: ['fact', 'preference', 'person', 'project', 'lesson'] }),
          importance: num('1 a 5.'),
        },
        ['content'],
      ),
    },
    run: async (a, ctx) => {
      const id = await remember(ctx.env, String(a.content), String(a.kind || 'fact'), 'tool', Number(a.importance) || 3);
      return id ? { saved: true, id } : { saved: false, reason: 'ya existía un recuerdo equivalente' };
    },
  },
  {
    def: {
      name: 'memory_list',
      description: 'Lista los recuerdos más recientes, o los que coinciden con una consulta.',
      parameters: params({ query: str('Opcional: filtro semántico.'), limit: num('Por defecto 20.') }),
    },
    run: async (a, ctx) => (await listMemories(ctx.env, Number(a.limit) || 20, a.query ? String(a.query) : undefined)).map((m) => ({ id: m.id, kind: m.kind, content: m.content })),
  },
  {
    def: {
      name: 'memory_forget',
      description: 'Archiva un recuerdo (deja de usarse). Requiere confirmación del usuario.',
      parameters: params({ id: str('Id del recuerdo (m_...)'), reason: str('Por qué.') }, ['id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Olvidar el recuerdo ${a.id}${a.reason ? ` (${a.reason})` : ''}`);
      return { forgotten: await archiveMemory(ctx.env, String(a.id)) };
    },
  },
  {
    def: {
      name: 'lesson_save',
      description: 'Registra una lección aprendida a partir de feedback del usuario, para no repetir errores o para reforzar lo que le gusta.',
      parameters: params(
        { content: str('La lección en una frase imperativa, p. ej. "Responder más corto cuando pregunta por la agenda".'), sentiment: str('positive | negative | neutral', { enum: ['positive', 'negative', 'neutral'] }) },
        ['content'],
      ),
    },
    run: async (a, ctx) => {
      await ctx.env.DB.prepare('INSERT INTO lessons(content,sentiment,created_at) VALUES(?,?,?)').bind(String(a.content), String(a.sentiment || 'neutral'), now()).run();
      await remember(ctx.env, `Lección: ${a.content}`, 'lesson', 'feedback', 4);
      return { saved: true };
    },
  },
];
