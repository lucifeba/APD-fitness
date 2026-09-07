import type { Env } from './env';
import { proposeAccompaniments, type PlanningInput, type PlanningPharmacy, type RouteDay } from './planning';
import { calendarUpsert, calendarsList } from './google';
import { pharmacyVisitEvent } from './pharmacyVisit';
import { stageCrmRecord, syncCrmExcel } from './crm';

export async function saveProposal(env: Env, input: PlanningInput, email: string) {
  const proposal = proposeAccompaniments(input);
  if (!proposal.selected.length) throw new Error('No hay días válidos para proponer. Revisa las rutas y la zona de referencia.');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO planning_proposals(id,month,proposal,created_by,created_at) VALUES(?,?,?,?,?)').bind(id, input.month, JSON.stringify(proposal), email, new Date().toISOString()).run();
  return { id, ...proposal };
}

const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const plusDay=(date:string)=>new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
async function eventId(seed:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));return 'nuvia'+[...new Uint8Array(bytes)].slice(0,15).map(x=>x.toString(16).padStart(2,'0')).join('')}
function fullPharmacy(value:string|PlanningPharmacy):PlanningPharmacy {
  if(typeof value==='string'||!value.name?.trim()||!value.address?.trim()||!value.classification?.trim()) throw new Error('Faltan dirección o clasificación de alguna farmacia. Completa la propuesta antes de aprobarla.');
  return value;
}
async function planningCalendars(env:Env){
  const calendars=(await calendarsList(env,true)).filter(c=>['owner','writer'].includes(c.accessRole));
  const exact=(names:string[])=>{const matches=calendars.filter(c=>names.includes(norm(c.name)));if(matches.length!==1)throw new Error(`No se ha encontrado un único calendario llamado ${names[0]}.`);return matches[0]};
  return {planning:exact(['planificacion']),accompaniments:exact(['calendario de acompanamiento delegados','calendario de acompanamiento a delegados','acompanamiento a delegados'])};
}

async function executeProposal(env:Env,id:string,email:string,selected:RouteDay[]){
  const all=selected.flatMap(day=>day.pharmacies.map(fullPharmacy));
  if(!all.length)throw new Error('La propuesta no contiene farmacias.');
  await syncCrmExcel(env);
  const cals=await planningCalendars(env);let events=0,visits=0;
  for(const day of selected){
    const pharmacies=day.pharmacies.map(fullPharmacy);const end=plusDay(day.date);
    const accompanimentId=await eventId(`${id}|accompaniment|${day.date}`);
    await calendarUpsert(env,{id:accompanimentId,calendar_id:cals.accompaniments.id,summary:`Acompañamiento · ${day.delegate}`,start:day.date,end,transparency:'transparent',description:`Delegado: ${day.delegate}\nZona: ${day.region}\nRuta: ${day.route}\nFarmacias:\n${pharmacies.map(p=>`• ${p.name}`).join('\n')}`},env.TIMEZONE||'Europe/Madrid');events++;
    await stageCrmRecord(env,`ACOMP-${id}-${day.date}`,'accompaniments',{'Fecha':day.date,'Delegado':day.delegate,'Ruta / zona':day.route,'Visitas planificadas':String(pharmacies.length),'Visitas efectivas':'','Objetivo acompañamiento':'Supervisión del trabajo en ruta','Foco observado':'','Fortalezas (evidencia)':'','Mejora (evidencia)':'','Acción del manager':'','Compromiso delegado':'','Fecha revisión':'','Estado':'Pendiente'},email);
    for(let i=0;i<pharmacies.length;i++){
      const p=pharmacies[i],visitId=await eventId(`${id}|visit|${day.date}|${i}|${p.name}`);
      const event=pharmacyVisitEvent({pharmacy:p.name,date:day.date,address:p.address,classification:p.classification,route:day.route,delegate:day.delegate,clientId:p.clientId,notes:p.notes},cals.planning.id);
      await calendarUpsert(env,{...event,id:visitId,calendar_id:cals.planning.id,transparency:'transparent'},env.TIMEZONE||'Europe/Madrid');events++;visits++;
      await stageCrmRecord(env,`VIS-${id}-${day.date}-${i}`,'visits',{'Fecha':day.date,'Delegado':day.delegate,'VDL':p.clientId||'','Cliente':p.name,'Con acompañamiento':'Sí','Planificada':'Sí','Efectiva':'','Objetivo':'Visita de acompañamiento','Resultado':'','Barreras':'','Potencial / oportunidad':'','Próxima acción':'','Nueva fecha de visita':'','Estado':'Pendiente','Realizada':'Pendiente','ID evento Google':visitId},email);
    }
  }
  const excel=await syncCrmExcel(env);
  return {calendarEventsCreated:events,visitsCreated:visits,excelRecordsSynced:excel.synced};
}

export async function decideProposal(env: Env, id: string, decision: 'approved' | 'cancelled', email: string) {
  if (email.trim().toLowerCase() !== env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error('Solo la propietaria puede decidir su planificación.');
  const current=await env.DB.prepare('SELECT proposal,status,execution_status,execution_detail FROM planning_proposals WHERE id=?').bind(id).first<{proposal:string;status:string;execution_status:string;execution_detail:string|null}>();
  if(!current)throw new Error('La propuesta no existe.');
  if(decision==='cancelled'){
    const result=await env.DB.prepare("UPDATE planning_proposals SET status='cancelled',decided_by=?,decided_at=? WHERE id=? AND status='pending_approval'").bind(email,new Date().toISOString(),id).run();
    if(result.meta.changes!==1)throw new Error('La propuesta ya ha sido aprobada o cancelada.');
    return {id,status:'cancelled',calendarEventsCreated:0};
  }
  if(current.status==='cancelled')throw new Error('La propuesta está cancelada.');
  if(current.execution_status==='completed')return {id,status:'approved',...JSON.parse(current.execution_detail||'{}')};
  if(current.status==='pending_approval')await env.DB.prepare("UPDATE planning_proposals SET status='approved',execution_status='running',decided_by=?,decided_at=? WHERE id=? AND status='pending_approval'").bind(email,new Date().toISOString(),id).run();
  try{
    const proposal=JSON.parse(current.proposal) as {selected:RouteDay[]};const detail=await executeProposal(env,id,email,proposal.selected);
    await env.DB.prepare("UPDATE planning_proposals SET execution_status='completed',execution_detail=? WHERE id=?").bind(JSON.stringify(detail),id).run();
    return {id,status:'approved',...detail};
  }catch(error){await env.DB.prepare("UPDATE planning_proposals SET execution_status='error',execution_detail=? WHERE id=?").bind(String(error),id).run();throw error;}
}

export async function listProposals(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM planning_proposals ORDER BY created_at DESC LIMIT 24').all<{id:string;month:string;proposal:string;status:string;created_at:string;decided_at:string|null;execution_status:string;execution_detail:string|null}>();
  return rows.results.map(({ proposal, ...row }) => ({ ...row, proposal: JSON.parse(proposal) }));
}
