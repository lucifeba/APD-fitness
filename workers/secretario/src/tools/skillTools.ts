import { now } from '../util';
import { params, str, type ToolSpec } from './types';

export const skillTools: ToolSpec[] = [
  {
    def: {
      name: 'skill_save',
      description:
        'Crea o mejora una habilidad: un procedimiento paso a paso que has aprendido para una tarea recurrente (cómo redacta el usuario sus correos, cómo quiere el resumen semanal...). Úsalo tras completar bien una tarea compleja o cuando el usuario te enseñe algo.',
      parameters: params(
        { name: str('Nombre corto en minúsculas con guiones, p. ej. resumen-semanal-atletas'), description: str('Cuándo aplicar la habilidad, en una frase.'), procedure: str('Pasos concretos, herramientas a usar, formato de salida, errores a evitar.') },
        ['name', 'description', 'procedure'],
      ),
    },
    run: async (a, ctx) => {
      const name = String(a.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60);
      const existing = await ctx.env.DB.prepare('SELECT version FROM skills WHERE name=?').bind(name).first<{ version: number }>();
      if (existing)
        await ctx.env.DB.prepare("UPDATE skills SET description=?, procedure=?, version=version+1, status='active', updated_at=? WHERE name=?")
          .bind(String(a.description), String(a.procedure), now(), name)
          .run();
      else
        await ctx.env.DB.prepare('INSERT INTO skills(name,description,procedure,created_at,updated_at) VALUES(?,?,?,?,?)')
          .bind(name, String(a.description), String(a.procedure), now(), now())
          .run();
      return { name, version: (existing?.version ?? 0) + 1 };
    },
  },
  {
    def: {
      name: 'skill_get',
      description: 'Lee el procedimiento completo de una habilidad antes de aplicarla.',
      parameters: params({ name: str('Nombre de la habilidad.') }, ['name']),
    },
    run: async (a, ctx) => {
      const s = await ctx.env.DB.prepare("SELECT name,description,procedure,version FROM skills WHERE name=? AND status='active'").bind(String(a.name)).first();
      if (!s) return { error: 'No existe esa habilidad.' };
      await ctx.env.DB.prepare('UPDATE skills SET uses=uses+1 WHERE name=?').bind(String(a.name)).run();
      return s;
    },
  },
  {
    def: {
      name: 'skill_list',
      description: 'Lista las habilidades disponibles con su descripción.',
      parameters: params({}),
    },
    run: async (_a, ctx) => (await ctx.env.DB.prepare("SELECT name,description,version,uses FROM skills WHERE status='active' ORDER BY uses DESC").all()).results,
  },
];

export async function skillIndex(env: { DB: D1Database }): Promise<string> {
  const rows = (await env.DB.prepare("SELECT name,description FROM skills WHERE status='active' ORDER BY uses DESC LIMIT 40").all<{ name: string; description: string }>()).results;
  return rows.map((r) => `- ${r.name}: ${r.description}`).join('\n');
}
