import type { Env } from './env';
import { proposeAccompaniments, type PlanningInput, type PlanningPharmacy, type Region, type RouteDay } from './planning';
import { calendarList, calendarUpsert, calendarsList } from './google';
import { pharmacyVisitEvent } from './pharmacyVisit';
import { importCrmExcel, stageCrmRecord, syncCrmExcel } from './crm';
import { setSetting } from './db';
import { parsePlanningWorkbook } from './planningXlsx';

const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
const plusDay=(date:string)=>new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
const nextMonth=(month:string)=>{const [year,value]=month.split('-').map(Number),date=new Date(Date.UTC(year,value,1));return date.toISOString().slice(0,7);};
const validMonth=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
async function eventId(seed:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));return 'nuvia'+[...new Uint8Array(bytes)].slice(0,15).map(x=>x.toString(16).padStart(2,'0')).join('');}

function fullPharmacy(value:string|PlanningPharmacy):PlanningPharmacy {
  if(typeof value==='string'||!value.name?.trim()||!value.address?.trim()||!value.classification?.trim()) throw new Error('Faltan dirección o clasificación de alguna farmacia. Completa la propuesta antes de aprobarla.');
  return value;
}

async function planningCalendars(env:Env){
  const calendars=(await calendarsList(env,true)).filter(c=>['owner','writer'].includes(c.accessRole));
  const exact=(names:string[])=>{const matches=calendars.filter(c=>names.includes(norm(c.name)));if(matches.length!==1)throw new Error(`No se ha encontrado un único calendario llamado ${names[0]}.`);return matches[0];};
  return {planning:exact(['planificacion']),accompaniments:exact(['calendario de acompanamiento delegados','calendario de acompanamiento a delegados','acompanamiento a delegados'])};
}

export async function planningAvailability(env:Env,month:string){
  if(!validMonth(month))throw new Error('Mes inválido.');
  const events=await calendarList(env,`${month}-01T00:00:00+01:00`,`${nextMonth(month)}-01T00:00:00+01:00`,500);
  const byDate:Record<string,{summary:string;calendar:string;start:string;end:string;allDay:boolean;transparent:boolean}[]>={};
  for(const event of events){const date=event.start.slice(0,10);if(!date.startsWith(month)||['familia','family'].includes(norm(event.calendar)))continue;(byDate[date]??=[]).push({summary:event.summary,calendar:event.calendar,start:event.start,end:event.end,allDay:event.allDay,transparent:event.transparency==='transparent'});}
  const days:{date:string;weekday:number;available:boolean;events:any[]}[]=[];
  for(let ms=Date.parse(`${month}-01T00:00:00Z`);new Date(ms).toISOString().startsWith(month);ms+=86400000){const date=new Date(ms).toISOString().slice(0,10),weekday=new Date(ms).getUTCDay(),dayEvents=byDate[date]||[];if([2,3,4].includes(weekday))days.push({date,weekday,available:!dayEvents.some(x=>!x.transparent),events:dayEvents});}
  return{month,days,busyDates:days.filter(x=>!x.available).map(x=>x.date),eventCount:events.length};
}

async function enrichRoutes(env:Env,routes:RouteDay[]){
  const latest=await env.DB.prepare('SELECT id FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT 1').first<{id:string}>();
  if(!latest)return routes;
  const clients=(await env.DB.prepare('SELECT vdl,client,classification,province,city,postal_code,route,delegate FROM sales_dashboard_clients WHERE import_id=?').bind(latest.id).all<any>()).results;
  const byId=new Map(clients.map(x=>[norm(String(x.vdl)),x])),byName=new Map(clients.map(x=>[norm(String(x.client)),x]));
  return routes.map(day=>({...day,pharmacies:day.pharmacies.map(value=>{if(typeof value==='string')return value;const match=(value.clientId&&byId.get(norm(value.clientId)))||byName.get(norm(value.name));if(!match)return value;return{...value,clientId:value.clientId||match.vdl,classification:value.classification||match.classification,address:value.address||[match.city,match.province,match.postal_code].filter(Boolean).join(', ')}})}));
}

export async function importPlanningSource(env:Env,bytes:ArrayBuffer|Uint8Array,sourceName:string,month:string,channel:string,email:string){
  const parsed=parsePlanningWorkbook(bytes,sourceName,month),routes=await enrichRoutes(env,parsed.routes);
  if(!routes.length)throw new Error(`El Excel no contiene rutas para ${month}.`);
  const id=crypto.randomUUID(),pharmacyCount=routes.reduce((n,x)=>n+x.pharmacies.length,0),stamp=new Date().toISOString();
  await env.DB.prepare('INSERT INTO planning_sources(id,month,source_name,source_channel,routes_json,warnings_json,raw_row_count,route_count,pharmacy_count,imported_by,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,month,sourceName,channel,JSON.stringify(routes),JSON.stringify(parsed.warnings),parsed.rawRows,routes.length,pharmacyCount,email,stamp).run();
  return{id,month,sourceName,sourceChannel:channel,routeCount:routes.length,pharmacyCount,warnings:parsed.warnings,importedAt:stamp};
}

export function telegramPlanningSummary(result:{month:string;routeCount:number;pharmacyCount:number;warnings:string[]}){
  return `Planificación ${result.month} incorporada: ${result.routeCount} rutas y ${result.pharmacyCount} visitas. ${result.warnings.length?`Revisa ${result.warnings.length} avisos en la web antes de generar la propuesta.`:'Ya puedes generar la propuesta desde la pestaña Planificación.'}`;
}

export async function listPlanningSources(env:Env,month=''){
  const rows=month?await env.DB.prepare('SELECT * FROM planning_sources WHERE month=? ORDER BY imported_at DESC LIMIT 24').bind(month).all<any>():await env.DB.prepare('SELECT * FROM planning_sources ORDER BY imported_at DESC LIMIT 24').all<any>();
  return rows.results.map(({routes_json,warnings_json,...row}:any)=>({...row,routes:JSON.parse(routes_json),warnings:JSON.parse(warnings_json)}));
}

export async function saveProposal(env: Env, input: PlanningInput, email: string, sourceId:string|null=null,calendarSnapshot:unknown=null) {
  const proposal = proposeAccompaniments(input);
  if (!proposal.selected.length) throw new Error('No hay días válidos para proponer. Revisa las rutas, tu calendario y la zona de referencia.');
  const id = crypto.randomUUID(),stamp=new Date().toISOString();
  await env.DB.prepare('INSERT INTO planning_proposals(id,month,proposal,created_by,created_at,source_id,calendar_snapshot,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,input.month,JSON.stringify(proposal),email,stamp,sourceId,JSON.stringify(calendarSnapshot),stamp).run();
  return { id, ...proposal };
}

export async function createProposalFromSource(env:Env,input:{sourceId:string;anchorMonday:string;anchorRegion:Region},email:string){
  const source=await env.DB.prepare('SELECT id,month,routes_json FROM planning_sources WHERE id=?').bind(input.sourceId).first<{id:string;month:string;routes_json:string}>();
  if(!source)throw new Error('No se encuentra el Excel seleccionado.');
  const historyRows=await env.DB.prepare("SELECT proposal FROM planning_proposals WHERE status='approved' AND month<? ORDER BY month DESC,created_at DESC LIMIT 18").bind(source.month).all<{proposal:string}>();
  const history=historyRows.results.flatMap(x=>(JSON.parse(x.proposal).selected||[]) as RouteDay[]),availability=await planningAvailability(env,source.month);
  return saveProposal(env,{month:source.month,anchorMonday:input.anchorMonday,anchorRegion:input.anchorRegion,routes:JSON.parse(source.routes_json),history,unavailableDates:availability.busyDates},email,source.id,availability);
}

function validateEditedSelection(month:string,selected:RouteDay[],flexible:boolean){
  if(!Array.isArray(selected)||!selected.length||selected.length>40)throw new Error('La propuesta debe contener entre 1 y 40 días.');
  const dates=new Set<string>();
  for(const day of selected){if(!day.date?.startsWith(month)||!day.delegate?.trim()||!day.route?.trim()||!['Madrid','Aragón'].includes(day.region)||!Array.isArray(day.pharmacies)||!day.pharmacies.length)throw new Error('Hay un día incompleto o fuera del mes.');const weekday=new Date(`${day.date}T00:00:00Z`).getUTCDay();if(!flexible&&![2,3,4].includes(weekday))throw new Error('Los acompañamientos deben mantenerse en martes, miércoles o jueves. Activa la excepción flexible si necesitas otro día.');if(dates.has(day.date))throw new Error('Solo puede haber un acompañamiento por día.');dates.add(day.date);for(const item of day.pharmacies){if(typeof item==='string'||!item.name?.trim())throw new Error('Todas las visitas necesitan una farmacia.');if(item.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time))throw new Error('Revisa los horarios de las visitas.');}}
}

export async function updateProposal(env:Env,id:string,selected:RouteDay[],flexible:boolean,email:string){
  if(email.trim().toLowerCase()!==env.OWNER_EMAIL?.trim().toLowerCase())throw new Error('Solo la propietaria puede editar la planificación.');
  const current=await env.DB.prepare('SELECT month,proposal,status FROM planning_proposals WHERE id=?').bind(id).first<{month:string;proposal:string;status:string}>();
  if(!current||current.status!=='pending_approval')throw new Error('Solo se puede editar una propuesta pendiente.');
  validateEditedSelection(current.month,selected,flexible);const proposal={...JSON.parse(current.proposal),selected,flexible};
  await env.DB.prepare('UPDATE planning_proposals SET proposal=?,updated_at=? WHERE id=?').bind(JSON.stringify(proposal),new Date().toISOString(),id).run();
  return{id,status:'pending_approval',proposal};
}

async function executeProposal(env:Env,id:string,email:string,selected:RouteDay[]){
  const all=selected.flatMap(day=>day.pharmacies.map(fullPharmacy));if(!all.length)throw new Error('La propuesta no contiene farmacias.');
  await syncCrmExcel(env);const cals=await planningCalendars(env);let events=0,visits=0;
  for(const day of selected){
    const pharmacies=day.pharmacies.map(fullPharmacy),end=plusDay(day.date),accompanimentId=await eventId(`${id}|accompaniment|${day.date}`);
    await calendarUpsert(env,{id:accompanimentId,calendar_id:cals.accompaniments.id,summary:`Acompañamiento · ${day.delegate}`,start:day.date,end,transparency:'transparent',description:`Delegado: ${day.delegate}\nZona: ${day.region}\nRuta: ${day.route}\nFarmacias:\n${pharmacies.map(p=>`• ${p.name} · ${p.classification} · ${p.address}`).join('\n')}\n\n[Aravitas:planning:${id}]`},env.TIMEZONE||'Europe/Madrid');events++;
    await stageCrmRecord(env,`ACOMP-${id}-${day.date}`,'accompaniments',{'Fecha':day.date,'Delegado':day.delegate,'Ruta / zona':day.route,'Visitas planificadas':String(pharmacies.length),'Visitas efectivas':'','Objetivo acompañamiento':'Supervisión del trabajo en ruta','Foco observado':'','Fortalezas (evidencia)':'','Mejora (evidencia)':'','Acción del manager':'','Compromiso delegado':'','Fecha revisión':'','Estado':'Pendiente','ID evento Google':accompanimentId},email);
    for(let i=0;i<pharmacies.length;i++){
      const p=pharmacies[i],visitId=await eventId(`${id}|visit|${day.date}|${i}|${p.name}`),event=pharmacyVisitEvent({pharmacy:p.name,date:day.date,address:p.address,classification:p.classification,route:day.route,delegate:day.delegate,clientId:p.clientId,notes:[p.notes,`[Aravitas:planning:${id}]`].filter(Boolean).join('\n'),time:p.time,durationMinutes:p.durationMinutes},cals.planning.id);
      await calendarUpsert(env,{...event,id:visitId,calendar_id:cals.planning.id,transparency:'transparent'},env.TIMEZONE||'Europe/Madrid');events++;visits++;
      await stageCrmRecord(env,`VIS-${id}-${day.date}-${i}`,'visits',{'Fecha':day.date,'Delegado':day.delegate,'VDL':p.clientId||'','Cliente':p.name,'Dirección':p.address,'Clasificación':p.classification,'Ruta':day.route,'Con acompañamiento':'Sí','Planificada':'Sí','Efectiva':'','Objetivo':'Visita de acompañamiento','Resultado':'','Barreras':'','Potencial / oportunidad':'','Próxima acción':'','Nueva fecha de visita':'','Estado':'Pendiente','Realizada':'Pendiente','ID evento Google':visitId},email);
    }
  }
  const excel=await syncCrmExcel(env);return{calendarEventsCreated:events,visitsCreated:visits,excelRecordsSynced:excel.synced};
}

export async function decideProposal(env: Env, id: string, decision: 'approved' | 'cancelled', email: string) {
  if (email.trim().toLowerCase() !== env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error('Solo la propietaria puede decidir su planificación.');
  const current=await env.DB.prepare('SELECT proposal,status,execution_status,execution_detail FROM planning_proposals WHERE id=?').bind(id).first<{proposal:string;status:string;execution_status:string;execution_detail:string|null}>();
  if(!current)throw new Error('La propuesta no existe.');
  if(decision==='cancelled'){const result=await env.DB.prepare("UPDATE planning_proposals SET status='cancelled',decided_by=?,decided_at=?,updated_at=? WHERE id=? AND status='pending_approval'").bind(email,new Date().toISOString(),new Date().toISOString(),id).run();if(result.meta.changes!==1)throw new Error('La propuesta ya ha sido aprobada o cancelada.');return{id,status:'cancelled',calendarEventsCreated:0};}
  if(current.status==='cancelled')throw new Error('La propuesta está cancelada.');if(current.execution_status==='completed')return{id,status:'approved',...JSON.parse(current.execution_detail||'{}')};
  if(current.status==='pending_approval')await env.DB.prepare("UPDATE planning_proposals SET status='approved',execution_status='running',decided_by=?,decided_at=?,updated_at=? WHERE id=? AND status='pending_approval'").bind(email,new Date().toISOString(),new Date().toISOString(),id).run();
  try{const proposal=JSON.parse(current.proposal)as{selected:RouteDay[]};const detail=await executeProposal(env,id,email,proposal.selected);await env.DB.prepare("UPDATE planning_proposals SET execution_status='completed',execution_detail=?,updated_at=? WHERE id=?").bind(JSON.stringify(detail),new Date().toISOString(),id).run();return{id,status:'approved',...detail};}
  catch(error){await env.DB.prepare("UPDATE planning_proposals SET execution_status='error',execution_detail=?,updated_at=? WHERE id=?").bind(String(error),new Date().toISOString(),id).run();throw error;}
}

export async function listProposals(env: Env) {
  const rows=await env.DB.prepare('SELECT * FROM planning_proposals ORDER BY created_at DESC LIMIT 36').all<any>();
  return rows.results.map(({proposal,calendar_snapshot,...row}:any)=>({...row,proposal:JSON.parse(proposal),calendarSnapshot:calendar_snapshot?JSON.parse(calendar_snapshot):null}));
}

const field=(description:string|undefined,label:string)=>description?.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`,'i'))?.[1]?.trim()||'';
export async function syncManualPlanningEvents(env:Env){
  const cals=await planningCalendars(env),now=new Date(),from=new Date(now.getTime()-60*86400000).toISOString(),to=new Date(now.getTime()+240*86400000).toISOString(),events=await calendarList(env,from,to,500,cals.planning.id);
  let changed=0;
  for(const event of events){if(event.id.startsWith('nuvia')||(!/^visita\b|^farmacia\b/i.test(event.summary)&&!field(event.description,'Farmacia')))continue;const client=field(event.description,'Farmacia')||event.summary.replace(/^(visita|farmacia)\s*[·:\-]?\s*/i,'').trim();if(!client)continue;
    const match=await env.DB.prepare('SELECT c.* FROM sales_dashboard_clients c JOIN sales_dashboard_imports i ON i.id=c.import_id WHERE lower(c.client)=lower(?) ORDER BY i.source_date DESC,i.imported_at DESC LIMIT 1').bind(client).first<any>();
    const date=event.start.slice(0,10),data={'Fecha':date,'Delegado':field(event.description,'Delegado')||match?.delegate||'Sin asignar','VDL':field(event.description,'VDL')||match?.vdl||'','Cliente':client,'Con acompañamiento':'No','Planificada':'Sí','Efectiva':'','Objetivo':'Visita creada manualmente en Google Calendar','Resultado':'','Barreras':'','Potencial / oportunidad':'','Próxima acción':'','Nueva fecha de visita':'','Estado':'Pendiente','Realizada':'Pendiente','ID evento Google':event.id},json=JSON.stringify(data),id=`GCAL-${event.id.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,70)}`,existing=await env.DB.prepare('SELECT data FROM crm_records WHERE id=?').bind(id).first<{data:string}>();
    if(!existing){await env.DB.prepare('INSERT INTO crm_records(id,section,data,version,updated_at,updated_by,synced_version,source_row) VALUES(?,?,?,1,?,?,0,NULL)').bind(id,'visits',json,new Date().toISOString(),'calendar-sync').run();changed++;}
    else if(existing.data!==json){await env.DB.prepare('UPDATE crm_records SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=?').bind(json,new Date().toISOString(),'calendar-sync',id).run();changed++;}
  }
  if(!changed)return{scanned:events.length,changed:0,synced:0};const synced=await syncCrmExcel(env);return{scanned:events.length,changed,synced:synced.synced};
}

const googleRecordId=(eventId:string)=>'GCAL-'+eventId.replace(/[^a-zA-Z0-9-]/g,'-').slice(0,70);
const pharmacyCount=(description:string|undefined)=>description?.split('\n').filter(x=>/^\s*[•*-]\s+/.test(x)).length||0;

/** Reconciliación completa: Excel -> aplicación, calendarios -> aplicación y aplicación -> Excel. */
export async function syncOperationalData(env:Env){
  const started=new Date().toISOString();let imported:any=null,importError='';
  try{imported=await importCrmExcel(env,'automatic-excel-sync')}catch(error){importError=error instanceof Error?error.message:String(error)}
  const cals=await planningCalendars(env),now=new Date(),from=new Date(now.getTime()-120*86400000).toISOString(),to=new Date(now.getTime()+370*86400000).toISOString();
  const [visits,accompaniments,recordRows,clientRows]=await Promise.all([
    calendarList(env,from,to,1000,cals.planning.id),calendarList(env,from,to,1000,cals.accompaniments.id),
    env.DB.prepare("SELECT id,section,data,version FROM crm_records WHERE section IN ('visits','accompaniments')").all<{id:string;section:'visits'|'accompaniments';data:string;version:number}>(),
    env.DB.prepare('SELECT c.* FROM sales_dashboard_clients c JOIN sales_dashboard_imports i ON i.id=c.import_id WHERE i.id=(SELECT id FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT 1)').all<any>(),
  ]);
  const records=recordRows.results.map(row=>({...row,values:JSON.parse(row.data)as Record<string,string>})),byEvent=new Map(records.filter(x=>x.values['ID evento Google']).map(x=>[x.values['ID evento Google'],x])),clients=new Map(clientRows.results.map(x=>[norm(String(x.client)),x]));let changed=0;
  const upsert=async(section:'visits'|'accompaniments',eventId:string,data:Record<string,string>)=>{const current=byEvent.get(eventId),stamp=new Date().toISOString(),json=JSON.stringify(data);if(!current){await env.DB.prepare('INSERT OR IGNORE INTO crm_records(id,section,data,version,updated_at,updated_by,synced_version,source_row) VALUES(?,?,?,1,?,?,0,NULL)').bind(googleRecordId(eventId),section,json,stamp,'calendar-sync').run();changed++;return}if(current.data!==json){await env.DB.prepare('UPDATE crm_records SET data=?,version=version+1,updated_at=?,updated_by=? WHERE id=?').bind(json,stamp,'calendar-sync',current.id).run();current.data=json;current.values=data;changed++;}};
  for(const event of visits){const current=byEvent.get(event.id),named=field(event.description,'Farmacia')||event.summary.replace(/^(visita|farmacia)\s*[·:\-]?\s*/i,'').trim(),match=clients.get(norm(named));if(!current&&!field(event.description,'Farmacia')&&!/^(visita|farmacia)\b/i.test(event.summary)&&!match)continue;const old=current?.values||{},client=field(event.description,'Farmacia')||match?.client||named;if(!client)continue;await upsert('visits',event.id,{...old,'Fecha':event.start.slice(0,10),'Delegado':field(event.description,'Delegado')||match?.delegate||old.Delegado||'Sin asignar','VDL':field(event.description,'VDL')||match?.vdl||old.VDL||'','Cliente':client,'Dirección':field(event.description,'Dirección')||event.location||old['Dirección']||'','Clasificación':field(event.description,'Clasificación del cliente')||match?.classification||old['Clasificación']||'','Ruta':field(event.description,'Ruta')||match?.route||old.Ruta||'','Con acompañamiento':old['Con acompañamiento']||'No','Planificada':'Sí','Efectiva':old.Efectiva||'','Objetivo':old.Objetivo||'Visita creada en Google Calendar','Resultado':old.Resultado||'','Barreras':old.Barreras||'','Potencial / oportunidad':old['Potencial / oportunidad']||'','Próxima acción':old['Próxima acción']||'','Nueva fecha de visita':old['Nueva fecha de visita']||'','Estado':old.Estado||'Pendiente','Realizada':old.Realizada||'Pendiente','ID evento Google':event.id});}
  for(const event of accompaniments){const delegate=field(event.description,'Delegado')||event.summary.replace(/^acompa(?:ñ|n)amiento\s*[·:\-]?\s*/i,'').trim();if(!delegate)continue;const date=event.start.slice(0,10),fallback=records.find(x=>x.section==='accompaniments'&&!x.values['ID evento Google']&&x.values.Fecha===date&&norm(x.values.Delegado)===norm(delegate));if(fallback)byEvent.set(event.id,fallback);const current=byEvent.get(event.id),old=current?.values||{};await upsert('accompaniments',event.id,{...old,'Fecha':date,'Delegado':delegate,'Ruta / zona':field(event.description,'Ruta')||old['Ruta / zona']||'Sin ruta','Visitas planificadas':String(pharmacyCount(event.description)||Number(old['Visitas planificadas']||0)),'Visitas efectivas':old['Visitas efectivas']||'','Objetivo acompañamiento':old['Objetivo acompañamiento']||'Supervisión y desarrollo del delegado en ruta','Foco observado':old['Foco observado']||'','Fortalezas (evidencia)':old['Fortalezas (evidencia)']||'','Mejora (evidencia)':old['Mejora (evidencia)']||'','Acción del manager':old['Acción del manager']||'','Compromiso delegado':old['Compromiso delegado']||'','Fecha revisión':old['Fecha revisión']||'','Estado':old.Estado||'Pendiente','ID evento Google':event.id});}
  let excel:any={synced:0};let syncError='';try{excel=await syncCrmExcel(env)}catch(error){syncError=error instanceof Error?error.message:String(error)}
  const result={started,finished:new Date().toISOString(),calendarEventsScanned:visits.length+accompaniments.length,visitsScanned:visits.length,accompanimentsScanned:accompaniments.length,changed,excelImported:imported?.changed||0,excelSynced:excel.synced||0,importError,syncError};await setSetting(env,'last_operational_sync',result.finished);await setSetting(env,'last_operational_result',JSON.stringify(result));return result;
}
