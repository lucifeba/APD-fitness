import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { driveBinaryMetadata, driveDownloadBytes, driveUpdateBytes } from './google';
import { displayValue, nextEmptyRows, patchSheet, readSheet } from './xlsxCrm';

// Labels follow the existing workbook. IDs and Calendar references are not editable.
export const crmFields = {
  visits: ['Fecha','Delegado','VDL','Cliente','Con acompañamiento','Planificada','Efectiva','Objetivo','Resultado','Barreras','Potencial / oportunidad','Próxima acción','Nueva fecha de visita','Estado','Realizada'],
  accompaniments: ['Fecha','Delegado','Ruta / zona','Visitas planificadas','Visitas efectivas','Objetivo acompañamiento','Foco observado','Fortalezas (evidencia)','Mejora (evidencia)','Acción del manager','Compromiso delegado','Fecha revisión','Estado'],
} as const;
export type CrmSection = keyof typeof crmFields;
const sheetFor:Record<CrmSection,string>={visits:'VISITAS',accompaniments:'ACOMPAÑAMIENTOS'};
const numericFields=['Visitas planificadas','Visitas efectivas'];
const safeId=(value:string)=>value.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,80);
const hash=(value:string)=>{let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36)};
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
      const pending=await env.DB.prepare('SELECT COUNT(*) n FROM crm_records WHERE version>synced_version').first<{n:number}>();
      return reply({fields:crmFields[section],records:rows.results.map(row=>({...row,data:JSON.parse(row.data)})),excelSyncAvailable:Boolean(env.CRM_DRIVE_FILE_ID),pending:Number(pending?.n||0),sourceModified:await getSetting(env,'crm_excel_modified_time')});
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

export async function importCrmExcel(env:Env,email:string) {
  const fileId=env.CRM_DRIVE_FILE_ID; if(!fileId) throw new Error('No está configurado el Excel CRM de Drive.');
  const meta=await driveBinaryMetadata(env,fileId);
  if(meta.mimeType!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new Error('El CRM de Drive no es un archivo XLSX.');
  const bytes=await driveDownloadBytes(env,fileId); let imported=0;
  for(const section of ['visits','accompaniments'] as CrmSection[]) {
    const parsed=readSheet(bytes,sheetFor[section]); const statements=[];
    for(const item of parsed.data) {
      const data:Record<string,string>={};
      for(const field of crmFields[section]) data[field]=displayValue(field,item.values[field]||'');
      if(!data.Fecha||!data.Delegado||(section==='visits'&&!data.Cliente)) continue;
      const rawId=item.values.ID||`${section}-${data.Fecha}-${data.Delegado}-${data.Cliente||data['Ruta / zona']}-${item.row}`;
      const id=safeId(item.values.ID||'')||`xlsx-${hash(rawId)}`;
      statements.push(env.DB.prepare(`INSERT INTO crm_records(id,section,data,version,updated_at,updated_by,synced_version,source_row) VALUES(?,?,?,1,?,?,1,?) ON CONFLICT(id) DO UPDATE SET source_row=COALESCE(crm_records.source_row,excluded.source_row)`).bind(id,section,JSON.stringify(data),new Date().toISOString(),email,item.row));
      imported++;
    }
    for(let i=0;i<statements.length;i+=50) await env.DB.batch(statements.slice(i,i+50));
  }
  await setSetting(env,'crm_excel_modified_time',meta.modifiedTime);
  await setSetting(env,'crm_excel_name',meta.name);
  return {imported,modifiedTime:meta.modifiedTime,name:meta.name};
}

export async function syncCrmExcel(env:Env) {
  const fileId=env.CRM_DRIVE_FILE_ID; if(!fileId) throw new Error('No está configurado el Excel CRM de Drive.');
  const importedModified=await getSetting(env,'crm_excel_modified_time');
  if(!importedModified) throw new Error('Importa primero el Excel para evitar sobrescribir cambios externos.');
  const meta=await driveBinaryMetadata(env,fileId);
  if(meta.modifiedTime!==importedModified) throw new Error('El Excel ha cambiado en Drive desde la última importación. Impórtalo de nuevo y revisa los cambios.');
  let bytes=await driveDownloadBytes(env,fileId); const synced:{id:string;version:number}[]=[];
  for(const section of ['visits','accompaniments'] as CrmSection[]) {
    const rows=await env.DB.prepare('SELECT id,data,version,source_row FROM crm_records WHERE section=? AND version>synced_version ORDER BY updated_at').bind(section).all<{id:string;data:string;version:number;source_row:number|null}>();
    const newRows=nextEmptyRows(bytes,sheetFor[section],rows.results.filter(r=>!r.source_row).length); let cursor=0;
    const updates=rows.results.map(row=>{
      const sourceRow=row.source_row||newRows[cursor++]; const data=JSON.parse(row.data) as Record<string,string>;
      return {sourceRow,update:{row:sourceRow,values:{ID:row.id,...data}},id:row.id,version:row.version};
    });
    if(updates.length) bytes=patchSheet(bytes,sheetFor[section],updates.map(x=>x.update),numericFields);
    for(const item of updates){await env.DB.prepare('UPDATE crm_records SET source_row=? WHERE id=?').bind(item.sourceRow,item.id).run();synced.push({id:item.id,version:item.version});}
  }
  if(!synced.length) return {synced:0,modifiedTime:meta.modifiedTime};
  const updated=await driveUpdateBytes(env,fileId,bytes,meta.mimeType);
  for(let i=0;i<synced.length;i+=50) await env.DB.batch(synced.slice(i,i+50).map(x=>env.DB.prepare('UPDATE crm_records SET synced_version=? WHERE id=? AND version=?').bind(x.version,x.id,x.version)));
  await setSetting(env,'crm_excel_modified_time',updated.modifiedTime);
  return {synced:synced.length,modifiedTime:updated.modifiedTime,size:updated.size};
}

export async function stageCrmRecord(env:Env,id:string,section:CrmSection,data:Record<string,string>,email:string) {
  await env.DB.prepare('INSERT OR IGNORE INTO crm_records(id,section,data,version,updated_at,updated_by,synced_version,source_row) VALUES(?,?,?,1,?,?,0,NULL)')
    .bind(safeId(id),section,JSON.stringify(data),new Date().toISOString(),email).run();
}
