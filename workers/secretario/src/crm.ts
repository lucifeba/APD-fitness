import type { Env } from './env';

// Labels follow the existing workbook. IDs and Calendar references are not editable.
export const crmFields = {
  visits: ['Fecha','Delegado','VDL','Cliente','Con acompañamiento','Planificada','Efectiva','Objetivo','Resultado','Barreras','Potencial / oportunidad','Próxima acción','Nueva fecha de visita','Estado','Realizada'],
  accompaniments: ['Fecha','Delegado','Ruta / zona','Visitas planificadas','Visitas efectivas','Objetivo acompañamiento','Foco observado','Fortalezas (evidencia)','Mejora (evidencia)','Acción del manager','Compromiso delegado','Fecha revisión','Estado'],
} as const;
export type CrmSection = keyof typeof crmFields;
export function validateCrm(section: unknown, input: unknown): Record<string,string> {
  if (section !== 'visits' && section !== 'accompaniments') throw new Error('Sección inválida.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Registro inválido.');
  const result: Record<string,string> = {};
  for (const [key,value] of Object.entries(input)) {
    if (!(crmFields[section] as readonly string[]).includes(key) || typeof value !== 'string' || value.length > 4000) throw new Error('Campo no permitido o demasiado largo.');
    result[key] = value.trim();
    if (key.includes('Fecha') || key === 'Nueva fecha de visita') {
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new Error('Revisa las fechas.');
    }
  }
  if (!result.Fecha || !result.Delegado || (section === 'visits' && !result.Cliente)) throw new Error('Completa fecha, delegado y, para visitas, cliente.');
  return result;
}
export async function crmApi(req: Request, env: Env, email: string): Promise<Response> {
  const reply = (body: unknown, status=200) => Response.json(body,{status,headers:{'cache-control':'no-store'}});
  try {
    if (req.method === 'GET') {
      const section = new URL(req.url).searchParams.get('section');
      if (section !== 'visits' && section !== 'accompaniments') return reply({error:'Sección inválida'},400);
      const rows = await env.DB.prepare('SELECT * FROM crm_records WHERE section=? ORDER BY updated_at DESC LIMIT 500').bind(section).all<{id:string;data:string;version:number;synced_version:number}>();
      return reply({fields:crmFields[section],records:rows.results.map(row=>({...row,data:JSON.parse(row.data)})),excelSyncAvailable:false});
    }
    if (req.method !== 'PUT') return reply({error:'Método no permitido'},405);
    const b = await req.json<{id?:unknown;section?:unknown;data?:unknown;version?:unknown}>();
    if (typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(b.id) || !Number.isInteger(b.version) || Number(b.version)<0) return reply({error:'Identificador o versión inválidos'},400);
    const data = validateCrm(b.section,b.data);
    const stamp = new Date().toISOString();
    const statement = b.version === 0
      ? env.DB.prepare('INSERT OR IGNORE INTO crm_records(id,section,data,updated_at,updated_by) VALUES(?,?,?,?,?)').bind(b.id,b.section,JSON.stringify(data),stamp,email)
      : env.DB.prepare('UPDATE crm_records SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND section=? AND version=?').bind(JSON.stringify(data),stamp,email,b.id,b.section,b.version);
    const result = await statement.run();
    if (result.meta.changes !== 1) return reply({error:'Otro dispositivo ha modificado este registro. Recarga y revisa los cambios antes de guardar.'},409);
    return reply({id:b.id,version:Number(b.version)+1,excelSynced:false});
  } catch(e) {return reply({error:e instanceof Error?e.message:'No se pudo guardar el registro'},400);}
}
