import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import type { PlanningPharmacy, Region, RouteDay } from './planning';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
const DATE_ORIGIN = Date.UTC(1899, 11, 30);
const decode = (value:string) => value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const clean = (value:Cell) => String(value ?? '').trim();
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase();

function selectedUnzip(bytes:Uint8Array,wanted:Set<string>):Record<string,Uint8Array>{
  const out:Record<string,Uint8Array>={};let failure:Error|undefined;
  const unzip=new Unzip(file=>{const name=file.name.replace(/^\//,'');if(!wanted.has(name))return;const chunks:Uint8Array[]=[];let size=0;file.ondata=(err,data,final)=>{if(err){failure=err;return;}chunks.push(data);size+=data.length;if(final){const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}out[name]=merged;}};file.start();});
  unzip.register(UnzipInflate);unzip.push(bytes,true);if(failure)throw failure;return out;
}

function workbook(bytes:Uint8Array){
  const core=selectedUnzip(bytes,new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml']));
  const book=strFromU8(core['xl/workbook.xml']||new Uint8Array()),rels=strFromU8(core['xl/_rels/workbook.xml.rels']||new Uint8Array());
  if(!book||!rels)throw new Error('El archivo no es un XLSX válido.');
  const sheets:{name:string;path:string}[]=[];
  for(const match of book.matchAll(/<(?:\w+:)?sheet\b[^>]*name="([^"]+)"[^>]*(?:\w+:)?id="([^"]+)"[^>]*\/?\s*>/g)){
    const id=match[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const rel=rels.match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`));
    if(!rel)continue;let path=rel[1].replace(/^\//,'');if(!path.startsWith('xl/'))path='xl/'+path.replace(/^\.\//,'');
    sheets.push({name:decode(match[1]),path});
  }
  if(!sheets.length)throw new Error('El Excel no contiene hojas legibles.');
  const files=selectedUnzip(bytes,new Set([...sheets.map(x=>x.path),'xl/sharedStrings.xml']));
  const sharedXml=strFromU8(files['xl/sharedStrings.xml']||core['xl/sharedStrings.xml']||new Uint8Array());
  const shared=[...sharedXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>decode([...m[1].matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>x[1]).join('')));
  return {sheets,files,shared};
}

function parseCells(body:string,shared:string[]):Row{
  const row:Row={};const set=(attrs:string,content='')=>{const ref=attrs.match(/\br="([A-Z]+)\d+"/)?.[1];if(!ref)return;const type=attrs.match(/\bt="([^"]+)"/)?.[1];let raw=content.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1]??'';if(type==='inlineStr')raw=[...content.matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>x[1]).join('');let value:Cell=decode(raw);if(type==='s')value=shared[Number(raw)]??'';else if(type==='b')value=raw==='1';else if(type!=='inlineStr'&&raw!==''&&!Number.isNaN(Number(raw)))value=Number(raw);row[ref]=value;};
  for(const c of body.matchAll(/<(?:\w+:)?c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g))set(c[1],c[2]);
  for(const c of body.matchAll(/<(?:\w+:)?c\b([^>]*)\/>/g))set(c[1]);
  return row;
}

function rows(xml:string,shared:string[]):{number:number;values:Row}[]{
  const out:{number:number;values:Row}[]=[];
  for(const m of xml.matchAll(/<(?:\w+:)?row\b(?![^>]*\/>)[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g))out.push({number:Number(m[1]),values:parseCells(m[2],shared)});
  return out;
}

function dateValue(value:Cell,monthHint?:string):string{
  if(typeof value==='number'&&value>20000&&value<90000)return new Date(DATE_ORIGIN+value*86400000).toISOString().slice(0,10);
  const text=clean(value);if(!text)return'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)&&new Date(text+'T00:00:00Z').toISOString().slice(0,10)===text)return text;
  const match=text.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);if(!match)return'';
  const year=match[3]?Number(match[3])+(Number(match[3])<100?2000:0):Number(monthHint?.slice(0,4));
  if(!year)return'';const iso=`${year}-${String(Number(match[2])).padStart(2,'0')}-${String(Number(match[1])).padStart(2,'0')}`;
  return Number.isFinite(Date.parse(iso+'T00:00:00Z'))&&new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso?iso:'';
}

function regionValue(...values:string[]):Region|''{
  const text=normalize(values.join(' '));
  if(/\bmadrid\b/.test(text))return'Madrid';
  if(/\baragon\b|\bzaragoza\b|\bhuesca\b|\bteruel\b/.test(text))return'Aragón';
  return'';
}

const aliases={
  date:['fecha','dia','fecha visita','fecha planificada'],
  delegate:['delegado','delegada','representante','vendedor','usuario','visitador'],
  pharmacy:['farmacia','cliente','nombre cliente','razon social','nombre institucion','nombre de la institucion'],
  address:['direccion','domicilio','localizacion','ubicacion'],
  city:['localidad','municipio','poblacion','ciudad','provincia'],
  classification:['clasificacion','clas crm','segmento','categoria','tipo cliente'],
  route:['ruta','zona','itinerario','ruta zona'],
  region:['region','area','territorio'],
  clientId:['vdl','codigo cliente','id cliente','cod cliente'],
  notes:['observaciones','notas','comentarios'],
  time:['hora','horario','hora visita'],
} as const;
type Field=keyof typeof aliases;

function headerScore(row:Row){const values=Object.values(row).map(x=>normalize(clean(x)));return Object.values(aliases).flat().filter(a=>values.includes(a)).length;}
function headerMap(row:Row){const map:Partial<Record<Field,string>>={};for(const [column,value]of Object.entries(row)){const n=normalize(clean(value));for(const [field,names]of Object.entries(aliases)as[Field,readonly string[]][])if(!map[field]&&names.includes(n))map[field]=column;}return map;}
const cell=(row:Row,map:Partial<Record<Field,string>>,field:Field)=>map[field]?clean(row[map[field]!]):'';
const validTime=(value:string)=>{const m=value.match(/^(\d{1,2})(?::|\.)(\d{2})/);if(!m)return'';const h=Number(m[1]),min=Number(m[2]);return h<24&&min<60?`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`:'';};

export interface PlanningWorkbook {
  month:string;
  routes:RouteDay[];
  warnings:string[];
  sourceSheets:string[];
  rawRows:number;
}

export function parsePlanningWorkbook(input:ArrayBuffer|Uint8Array,sourceName:string,monthHint=''):PlanningWorkbook{
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);const book=workbook(bytes),items:{day:RouteDay;pharmacy:PlanningPharmacy}[]=[];const warnings:string[]=[];let rawRows=0;
  for(const sheet of book.sheets){
    const parsed=rows(strFromU8(book.files[sheet.path]||new Uint8Array()),book.shared);if(!parsed.length)continue;
    const header=parsed.slice(0,30).sort((a,b)=>headerScore(b.values)-headerScore(a.values))[0];if(!header||headerScore(header.values)<2){warnings.push(`${sheet.name}: no se reconoció una fila de cabeceras.`);continue;}
    const map=headerMap(header.values),dateColumns=Object.entries(header.values).map(([column,value])=>({column,date:dateValue(value,monthHint)})).filter(x=>x.date);
    for(const entry of parsed.filter(x=>x.number>header.number)){
      const genericSheet=/^(hoja|sheet|datos|planificacion|planning)\s*\d*$/i.test(normalize(sheet.name));
      rawRows++;const row=entry.values,delegate=cell(row,map,'delegate')||(!genericSheet?sheet.name:''),pharmacy=cell(row,map,'pharmacy');if(!pharmacy)continue;
      const address=[cell(row,map,'address'),cell(row,map,'city')].filter(Boolean).join(', '),classification=cell(row,map,'classification'),baseRoute=cell(row,map,'route'),explicitRegion=cell(row,map,'region'),clientId=cell(row,map,'clientId'),notes=cell(row,map,'notes'),time=validTime(cell(row,map,'time'));
      const push=(date:string,route:string)=>{const region=regionValue(explicitRegion,route,address,sheet.name);if(!date||!delegate||!region)return;items.push({day:{date,delegate,region,route:route||'Ruta sin nombre',pharmacies:[]},pharmacy:{name:pharmacy,address,classification,clientId,notes,time}});};
      const regularDate=dateValue(map.date?row[map.date]:null,monthHint);if(regularDate)push(regularDate,baseRoute);
      else for(const dc of dateColumns){const mark=clean(row[dc.column]);if(mark&&!/^(0|no|n|false)$/i.test(mark))push(dc.date,baseRoute||mark);}
    }
  }
  const grouped=new Map<string,RouteDay>();for(const item of items){const key=[item.day.date,item.day.delegate,item.day.region,item.day.route].join('|');let route=grouped.get(key);if(!route){route={...item.day,pharmacies:[]};grouped.set(key,route);}route.pharmacies.push(item.pharmacy);}
  const routes=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.delegate.localeCompare(b.delegate)||a.route.localeCompare(b.route));
  if(!routes.length)throw new Error('No se pudieron identificar visitas con fecha, delegado y zona. El Excel debe incluir esas columnas o una hoja por delegado.');
  const months=[...new Set(routes.map(x=>x.date.slice(0,7)))],month=monthHint||months.sort()[0];if(!month)throw new Error('No se pudo determinar el mes de la planificación.');
  const incomplete=routes.flatMap(r=>r.pharmacies).filter(p=>typeof p!=='string'&&(!p.address||!p.classification)).length;
  if(incomplete)warnings.push(`${incomplete} farmacias no tienen dirección o clasificación; deberán completarse antes de aprobar.`);
  if(months.length>1)warnings.push(`El archivo contiene varios meses: ${months.join(', ')}.`);
  return{month,routes:routes.filter(x=>x.date.startsWith(month)),warnings,sourceSheets:book.sheets.map(x=>x.name),rawRows};
}
