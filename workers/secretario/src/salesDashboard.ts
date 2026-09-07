import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import type { Env } from './env';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

export interface DashboardPayload {
  metadata: { sourceName:string; sourceDate:string; clientCount:number; productCount:number; recoveryMatchCount:number };
  quota: Record<string,unknown>[];
  cycles: Record<string,unknown>[];
  clients: Record<string,unknown>[];
  products: Record<string,unknown>[];
}

const XML_NS_DATE = Date.UTC(1899, 11, 30);
const decode = (s:string) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const clean = (v:Cell) => String(v ?? '').trim();
const number = (v:Cell) => { const n=Number(v); return Number.isFinite(n)?n:0; };
const nullableNumber = (v:Cell) => { if(v===null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null; };
const excelDate = (v:Cell) => { const n=Number(v); return Number.isFinite(n)?new Date(XML_NS_DATE+n*86400000).toISOString().slice(0,10):clean(v); };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').replace(/[^a-zA-Z0-9%]+/g,' ').trim().toLowerCase();
const col = (ref:string) => ref.match(/[A-Z]+/)?.[0] ?? '';

function selectedUnzip(bytes:Uint8Array,wanted:Set<string>):Record<string,Uint8Array>{
  const out:Record<string,Uint8Array>={};let failure:Error|undefined;
  const unzip=new Unzip(file=>{
    const name=file.name.replace(/^\//,'');
    if(!wanted.has(name))return;
    const chunks:Uint8Array[]=[];let size=0;
    file.ondata=(err,data,final)=>{
      if(err){failure=err;return}chunks.push(data);size+=data.length;
      if(final){const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length}out[name]=merged;}
    };
    file.start();
  });
  unzip.register(UnzipInflate);unzip.push(bytes,true);if(failure)throw failure;return out;
}

function workbookParts(bytes:Uint8Array){
  const core=selectedUnzip(bytes,new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml']));
  const workbook=strFromU8(core['xl/workbook.xml']||new Uint8Array());
  const rels=strFromU8(core['xl/_rels/workbook.xml.rels']||new Uint8Array());
  if(!workbook||!rels)throw new Error('El archivo no es un libro XLSX válido.');
  const paths:Record<string,string>={};
  for(const m of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*name="([^"]+)"[^>]*(?:\w+:)?id="([^"]+)"[^>]*\/?\s*>/g)){
    const rel=rels.match(new RegExp(`<Relationship\\b[^>]*Id="${m[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"[^>]*Target="([^"]+)"`));
    if(rel){let path=rel[1].replace(/^\//,'');if(!path.startsWith('xl/'))path='xl/'+path.replace(/^\.\//,'');paths[decode(m[1])]=path;}
  }
  const required=['Cuadro Mando','Cuota','Ciclos Cerrados','Presentaciones por Farmacia','Recuperaciones'];
  for(const name of required)if(!paths[name])throw new Error(`El Excel no contiene la hoja obligatoria “${name}”.`);
  const files=selectedUnzip(bytes,new Set([...Object.values(paths).filter(path=>required.some(name=>paths[name]===path)),'xl/sharedStrings.xml']));
  const sharedXml=strFromU8(files['xl/sharedStrings.xml']||core['xl/sharedStrings.xml']||new Uint8Array());
  const shared=[...sharedXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>decode([...m[1].matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>x[1]).join('')));
  return {paths,files,shared};
}

function rows(xml:string,shared:string[],min:number,max:number):Map<number,Row>{
  const result=new Map<number,Row>();
  for(const m of xml.matchAll(/<(?:\w+:)?row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){
    const rowNumber=Number(m[1]);if(rowNumber<min||rowNumber>max)continue;const item:Row={};
    for(const c of m[2].matchAll(/<(?:\w+:)?c\b([^>]*)\br="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
      const attrs=c[1]+c[3],body=c[4]||'',type=attrs.match(/\bt="([^"]+)"/)?.[1];
      let raw=body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1]??'';
      if(type==='inlineStr')raw=[...body.matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>x[1]).join('');
      let value:Cell=decode(raw);
      if(type==='s')value=shared[Number(raw)]??'';else if(type==='b')value=raw==='1';else if(type!=='inlineStr'&&raw!==''&&!Number.isNaN(Number(raw)))value=Number(raw);
      item[c[2]]=value;
    }
    result.set(rowNumber,item);
  }
  return result;
}

function headerMap(row:Row){const map:Record<string,string>={};for(const [letter,value] of Object.entries(row))if(value!==null&&value!=='')map[normalize(String(value))]=letter;return map;}
function fromHeader(row:Row,headers:Record<string,string>,...names:string[]){for(const name of names){const letter=headers[normalize(name)];if(letter)return row[letter]??null;}return null;}
function priority(classification:string,current:number,previous:number){const top=/premium|vip|plus|cliente a/i.test(classification);if(current<previous&&top)return'RECUPERAR';if(current<previous)return'VIGILAR';if(/no cliente/i.test(classification)&&current<=0)return'ACTIVAR';return'CONSOLIDAR';}

export function parseSalesDashboard(bytes:ArrayBuffer|Uint8Array,sourceName:string):DashboardPayload{
  const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const book=workbookParts(input);
  const sheet=(name:string,min:number,max:number)=>rows(strFromU8(book.files[book.paths[name]]),book.shared,min,max);
  const main=sheet('Cuadro Mando',1,1500),headers=headerMap(main.get(10)||{}),clients:Record<string,unknown>[]=[];
  const requiredHeaders=['Cod Del','VDL','Nombre de la Institución','Clas. CRM'];for(const h of requiredHeaders)if(!headers[normalize(h)])throw new Error(`Ha cambiado el esquema: falta la columna “${h}” en Cuadro Mando.`);
  const recoveryRows=sheet('Recuperaciones',7,1600),recovery=new Map<string,number>();for(const row of recoveryRows.values()){const vdl=clean(row.C);if(vdl)recovery.set(vdl,number(row.R));}
  const seen=new Set<string>();
  for(let i=11;i<=1500;i++){const row=main.get(i)||{},vdl=clean(fromHeader(row,headers,'VDL'));if(!vdl)continue;if(seen.has(vdl))throw new Error(`El Excel contiene un VDL duplicado: ${vdl}.`);seen.add(vdl);
    const previous=number(fromHeader(row,headers,'VRN YTD Ago 25 - 26')),current=number(fromHeader(row,headers,'VRN YTD Ago 26-27')),objective=number(fromHeader(row,headers,'OBJETIVO VENTA MENSUAL')),classification=clean(fromHeader(row,headers,'Clas. CRM'))||'Sin clasificar';
    clients.push({vdl,codDel:clean(fromHeader(row,headers,'Cod Del')),delegate:clean(fromHeader(row,headers,'Delegado')),client:clean(fromHeader(row,headers,'Nombre de la Institución')),classification,clientType:clean(fromHeader(row,headers,'Tipo')),previousVrn:previous,currentVrn:current,variation:current-previous,variationPct:previous?current/previous-1:null,objective,coverage:objective?current/objective:null,sow:nullableNumber(fromHeader(row,headers,'% SOW')),acuteShare:nullableNumber(fromHeader(row,headers,'% Agudo S/Total')),province:clean(fromHeader(row,headers,'Provincia')),city:clean(fromHeader(row,headers,'Ciudad')),postalCode:clean(fromHeader(row,headers,'CP')),region:clean(fromHeader(row,headers,'CCAA')),route:clean(fromHeader(row,headers,'RUTA')),unitsTotal:recovery.get(vdl)||0,priority:priority(classification,current,previous)});
  }
  const quota=[...sheet('Cuota',7,30).values()].filter(r=>clean(r.C)).map(r=>({codDel:clean(r.C),delegate:clean(r.D),quotaQ:number(r.E),objective1:number(r.F),objective2:number(r.G),objective3:number(r.H),sale1:number(r.I),sale2:number(r.J),sale3:number(r.K),coverageQ:number(r.O),gapQ:number(r.P)}));
  const cycles=[...sheet('Ciclos Cerrados',8,30).values()].filter(r=>clean(r.C)).map(r=>({codDel:clean(r.C),delegate:clean(r.D),previousQ:number(r.I),currentQ:number(r.J),platform:number(r.P),push:number(r.V),pharmacies200:number(r.AB),directOrders:number(r.AH),transferOrders:number(r.AN),directRatio:number(r.AT),clientsGrowing:number(r.AU),clientsDeclining:number(r.AV),eurosGrowing:number(r.AW),eurosDeclining:number(r.AX)}));
  const products=[...sheet('Presentaciones por Farmacia',7,1000).values()].filter(r=>clean(r.A)).map(r=>{const current=number(r.R),q1=number(r.Q);return{nationalCode:clean(r.A),presentation:clean(r.B),brand:clean(r.C),commercialType:clean(r.D),focus:clean(r.F),unitsCurrent:current,unitsQ1:q1,trendPct:q1?current/(q1/3)-1:null};});
  const recoveryMatchCount=clients.filter(c=>recovery.has(String(c.vdl))).length;if(!quota.length||!cycles.length)throw new Error('No se han encontrado datos válidos de cuota o ciclos.');if(recoveryMatchCount/Math.max(1,clients.length)<.95)throw new Error('La coincidencia de VDL con Recuperaciones es inferior al 95 %. Revisa el esquema antes de importar.');
  return{metadata:{sourceName,sourceDate:excelDate(main.get(1)?.H??''),clientCount:clients.length,productCount:products.length,recoveryMatchCount},quota,cycles,clients,products};
}

const bindMany=async(env:Env,statements:D1PreparedStatement[])=>{for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));};
export async function importSalesDashboard(env:Env,bytes:ArrayBuffer|Uint8Array,sourceName:string,sourceChannel:string,importedBy:string){
  const payload=parseSalesDashboard(bytes,sourceName),id=`${payload.metadata.sourceDate}-${crypto.randomUUID()}`,stamp=new Date().toISOString();
  await env.DB.prepare('INSERT INTO sales_dashboard_imports(id,source_name,source_date,source_channel,imported_at,imported_by,client_count,product_count,recovery_match_count) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,sourceName,payload.metadata.sourceDate,sourceChannel,stamp,importedBy,payload.metadata.clientCount,payload.metadata.productCount,payload.metadata.recoveryMatchCount).run();
  try{
    await bindMany(env,payload.quota.map((x:any)=>env.DB.prepare('INSERT INTO sales_dashboard_quota VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,x.codDel,x.delegate,x.quotaQ,x.objective1,x.objective2,x.objective3,x.sale1,x.sale2,x.sale3,x.coverageQ,x.gapQ)));
    await bindMany(env,payload.cycles.map((x:any)=>env.DB.prepare('INSERT INTO sales_dashboard_cycles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,x.codDel,x.delegate,x.previousQ,x.currentQ,x.platform,x.push,x.pharmacies200,x.directOrders,x.transferOrders,x.directRatio,x.clientsGrowing,x.clientsDeclining,x.eurosGrowing,x.eurosDeclining)));
    await bindMany(env,payload.clients.map((x:any)=>env.DB.prepare('INSERT INTO sales_dashboard_clients VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,x.vdl,x.codDel,x.delegate,x.client,x.classification,x.clientType,x.previousVrn,x.currentVrn,x.variation,x.variationPct,x.objective,x.coverage,x.sow,x.acuteShare,x.province,x.city,x.postalCode,x.region,x.route,x.unitsTotal,x.priority)));
    await bindMany(env,payload.products.map((x:any)=>env.DB.prepare('INSERT INTO sales_dashboard_products VALUES(?,?,?,?,?,?,?,?,?)').bind(id,x.nationalCode,x.presentation,x.brand,x.commercialType,x.focus,x.unitsCurrent,x.unitsQ1,x.trendPct)));
  }catch(e){await env.DB.batch(['quota','cycles','clients','products'].map(t=>env.DB.prepare(`DELETE FROM sales_dashboard_${t} WHERE import_id=?`).bind(id)));await env.DB.prepare('DELETE FROM sales_dashboard_imports WHERE id=?').bind(id).run();throw e;}
  const old=await env.DB.prepare('SELECT id FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT -1 OFFSET 16').all<{id:string}>();for(const item of old.results){await env.DB.batch(['quota','cycles','clients','products'].map(t=>env.DB.prepare(`DELETE FROM sales_dashboard_${t} WHERE import_id=?`).bind(item.id)));await env.DB.prepare('DELETE FROM sales_dashboard_imports WHERE id=?').bind(item.id).run();}
  return{id,...payload.metadata,sourceChannel};
}

export async function salesDashboardApi(req:Request,env:Env,email:string):Promise<Response>{
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
  try{
    if(req.method==='POST'){
      if(email.toLowerCase()!==env.OWNER_EMAIL?.toLowerCase())return reply({error:'Solo la propietaria puede cargar el cuadro de mando.'},403);
      const form=await req.formData(),file=form.get('file');if(!file||typeof file==='string'||file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.xlsx'))return reply({error:'Adjunta un XLSX de hasta 20 MB.'},400);
      return reply({ok:true,import:await importSalesDashboard(env,await file.arrayBuffer(),file.name,'web',email)});
    }
    if(req.method!=='GET')return reply({error:'Método no permitido'},405);
    const latest=await env.DB.prepare('SELECT * FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT 1').first<any>();if(!latest)return reply({ok:true,empty:true});
    const codDel=new URL(req.url).searchParams.get('delegate')||'',filter=codDel?' AND cod_del=?':'',args=codDel?[latest.id,codDel]:[latest.id];
    const [quota,cycles,classes,risks,opportunities,products]=await Promise.all([
      env.DB.prepare(`SELECT * FROM sales_dashboard_quota WHERE import_id=?${filter} ORDER BY coverage_q DESC`).bind(...args).all<any>(),
      env.DB.prepare(`SELECT * FROM sales_dashboard_cycles WHERE import_id=?${filter} ORDER BY current_q DESC`).bind(...args).all<any>(),
      env.DB.prepare(`SELECT classification,COUNT(*) clients,SUM(current_vrn) sales,SUM(variation) variation FROM sales_dashboard_clients WHERE import_id=?${filter} GROUP BY classification ORDER BY classification`).bind(...args).all<any>(),
      env.DB.prepare(`SELECT vdl,cod_del,delegate,client,classification,current_vrn,variation,variation_pct,city,route,priority FROM sales_dashboard_clients WHERE import_id=?${filter} AND priority IN ('RECUPERAR','VIGILAR') ORDER BY CASE priority WHEN 'RECUPERAR' THEN 0 ELSE 1 END,variation ASC LIMIT 20`).bind(...args).all<any>(),
      env.DB.prepare(`SELECT vdl,cod_del,delegate,client,classification,current_vrn,sow,city,route,priority FROM sales_dashboard_clients WHERE import_id=?${filter} AND priority='ACTIVAR' ORDER BY units_total DESC,client LIMIT 15`).bind(...args).all<any>(),
      env.DB.prepare("SELECT national_code,presentation,brand,focus,units_current,units_q1,trend_pct FROM sales_dashboard_products WHERE import_id=? AND (focus<>'' OR lower(presentation) LIKE '%escitalopram%' OR lower(presentation) LIKE '%ezetimiba%' OR lower(presentation) LIKE '%letrozol%' OR lower(presentation) LIKE '%pantoprazol%' OR lower(presentation) LIKE '%quetiapina%' OR lower(presentation) LIKE '%rivaroxaban%') ORDER BY trend_pct ASC LIMIT 30").bind(latest.id).all<any>(),
    ]);
    const delegates=await env.DB.prepare('SELECT cod_del,delegate FROM sales_dashboard_quota WHERE import_id=? ORDER BY delegate').bind(latest.id).all<any>();
    return reply({ok:true,latest,selectedDelegate:codDel,delegates:delegates.results,quota:quota.results,cycles:cycles.results,classifications:classes.results,risks:risks.results,opportunities:opportunities.results,products:products.results});
  }catch(e){return reply({error:e instanceof Error?e.message:'No se pudo procesar el cuadro de mando'},400);}
}

export function telegramDashboardSummary(result:{sourceDate:string;clientCount:number;productCount:number;recoveryMatchCount:number}){
  return `Cuadro de mando actualizado al ${result.sourceDate}: ${result.clientCount} farmacias y ${result.productCount} presentaciones. Coincidencia de recuperaciones: ${result.recoveryMatchCount}/${result.clientCount}. Ya está disponible en la pestaña Cuadro de mando de la web.`;
}
