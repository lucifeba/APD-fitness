// Workbook columns move when a quarter or month is added. Labels, not offsets,
// identify periods; zero is a reported value, never a reason to select an older Q.
export const SALES_SCHEMA_VERSION = 2;
export const SALES_PERIOD_VERSION = '2026-10-22-v2';
export const salesKey = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9%]+/gi, ' ').trim().toLowerCase();
export function quarterName(value: unknown) {
  const m = String(value ?? '').normalize('NFKC').match(/Q\s*([1-4])\s*(\d{2,4})\s*[-‐‑‒–—−/]\s*(\d{2,4})/i);
  return m && (Number(m[3].slice(-2))-Number(m[2].slice(-2))+100)%100===1 ? `Q${m[1]} ${m[2].slice(-2)}-${m[3].slice(-2)}` : '';
}
export function quarterOrder(value: unknown) {
  const m = quarterName(value).match(/Q(\d) (\d{2})-/);
  return m ? (2000 + Number(m[2])) * 4 + Number(m[1]) - 1 : -1;
}
export function quarterForMonth(value: string) {
  const digits = value.replace(/-/g, ''), year = Number(digits.slice(0, 4)), month = Number(digits.slice(4, 6));
  if (!year || month < 1 || month > 12) return '';
  const start = month >= 4 ? year : year - 1;
  return `Q${Math.floor(((month + 8) % 12) / 3) + 1} ${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}
export function latestQuarter(points: {quarter: string}[]) {
  return [...points].filter(p => quarterOrder(p.quarter) >= 0).sort((a,b) => quarterOrder(a.quarter)-quarterOrder(b.quarter)).at(-1)?.quarter || '';
}
const columnIndex = (value: string) => [...value].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const columnName = (index: number) => {let out='';while(index){index--;out=String.fromCharCode(65+index%26)+out;index=Math.floor(index/26)}return out;};
export function periodColumns(headers: Record<string, unknown>, groups: Record<string, unknown>, title: string, sheetName='') {
  const entries = Object.entries(groups).filter(([,value])=>String(value??'').trim()).sort((a,b)=>columnIndex(a[0])-columnIndex(b[0]));
  const index = entries.findIndex(([,value])=>salesKey(value)===salesKey(title));
  if (index < 0) throw new Error(`Falta el bloque «${title}» del Excel. No se publicarán datos de otro trimestre.`);
  // A new month/quarter can move data without moving a merged section heading
  // by the same number of cells. Identify complete chronological header runs,
  // then match their starts to headings. Never deduplicate a genuine duplicate
  // Q: an unassigned run is an ambiguous workbook and must remain unpublished.
  type Period = {column:string;quarter:string;current:boolean};
  const runs:Period[][]=[];
  for(const [column,value] of Object.entries(headers).sort((a,b)=>columnIndex(a[0])-columnIndex(b[0]))) {
    const quarter=quarterName(value);if(!quarter)continue;
    const point={column,quarter,current:/actual/i.test(String(value))},last=runs.at(-1)?.at(-1);
    if(last && columnIndex(column)===columnIndex(last.column)+1 && quarterOrder(quarter)===quarterOrder(last.quarter)+1)runs.at(-1)!.push(point);
    else runs.push([point]);
  }
  const periodTitles=new Set(['VENTA TOTAL','PLATAFORMA','V. PLATAFORMA CICLO','V. PUSH CICLO','Farmacias Cumplen > 200€','Pedidos Directos','Pedidos Transfer','% Directo sobre Transfer ( ni incluye P Negativas)','% Pedidos Directo sobre Total ( ni incluye P Negativas)','Aperturas Venta Push','VRN PUSH Aperturas','VRN PROMEDIO Aperturas',title].map(salesKey));
  const candidates=entries.map(([column,label])=>periodTitles.has(salesKey(label))?runs.flatMap((run,i)=>Math.abs(columnIndex(run[0].column)-columnIndex(column))<=2?[i]:[]):[]);
  // Match all headings together, in sheet order. Local nearest-neighbour
  // matching can assign two headings to the same run on a short history.
  const solutions:number[][]=[];
  const assign=(i:number,previous:number,current:number[])=>{
    if(solutions.length>1)return;
    if(i===entries.length){solutions.push(current);return;}
    if(!candidates[i].length){assign(i+1,previous,[...current,-1]);return;}
    for(const run of candidates[i])if(run>previous)assign(i+1,run,[...current,run]);
  };
  assign(0,-1,[]);
  const assignment=solutions.length===1?solutions[0]:entries.map(()=>-1);
  const selected=assignment[index],result=selected>=0?runs[selected]:[];
  const nextAssigned=assignment.slice(index+1).find(x=>x>=0),
    originalStart=columnIndex(entries[index][0]),
    originalEnd=index+1<entries.length?columnIndex(entries[index+1][0]):Infinity;
  const stray=runs.some((run,i)=>i!==selected && !assignment.includes(i) && (
    (columnIndex(run[0].column)>=originalStart&&columnIndex(run[0].column)<originalEnd) ||
    (selected>=0&&i>selected&&(nextAssigned===undefined||i<nextAssigned))
  ));
  const duplicateHeading=entries.filter(([,v])=>salesKey(v)===salesKey(title)).length!==1;
  const sharedRun=selected>=0&&assignment.filter(x=>x===selected).length!==1;
  if(!result.length || stray || duplicateHeading || sharedRun || result.filter(x=>x.current).length>1 || result.some((x,i)=>x.current&&i!==result.length-1)) {
    const observed=Object.entries(headers).filter(([c])=>columnIndex(c)>=originalStart&&columnIndex(c)<originalEnd).map(([c,v])=>`${c}: ${String(v??'').replace(/\s+/g,' ').slice(0,65)}`).filter(x=>!x.endsWith(': ')).join('; ');
    throw new Error(`No se pueden identificar con seguridad los trimestres de «${title}»${sheetName?' en '+sheetName:''}. Columnas ${entries[index][0]}–${Number.isFinite(originalEnd)?columnName(originalEnd-1):'final'}: ${observed || 'sin encabezados trimestrales'}. El cuadro vigente se conserva.`);
  }
  return result;
}
export function readPeriodSeries(row: Record<string, unknown>, totals: ReturnType<typeof periodColumns>, platform: ReturnType<typeof periodColumns>, push: ReturnType<typeof periodColumns>, progress=1) {
  const map=(items:typeof totals)=>new Map(items.map(x=>[x.quarter,x.column]));
  const plats=map(platform),direct=map(push);
  return totals.map((point,index)=>{
    if(!plats.has(point.quarter)||!direct.has(point.quarter))throw new Error(`Falta el desglose push/plataforma de ${point.quarter}.`);
    const value=(col:string)=>{const n=Number(row[col]??0);if(!Number.isFinite(n))throw new Error(`Dato no numérico en ${col}.`);return n;};
    const total=value(point.column),p=value(plats.get(point.quarter)!),d=value(direct.get(point.quarter)!);
    if(Math.abs(total-p-d)>Math.max(.05,Math.abs(total)*.000001))throw new Error(`La venta total no coincide con push + plataforma en ${point.quarter}. Revisa el Excel antes de publicarlo.`);
    return {quarter:point.quarter,total,platform:p,push:d,directPct:total?d/total:null,platformPct:total?p/total:null,...(index===totals.length-1&&progress<.98?{projected:total/progress}:{})};
  });
}
export function mergeQuarterHistory<T extends {quarter:string}>(versions: T[][], cutoff: string) {
  const map=new Map<string,T>();
  // Versions are oldest first. A newer reported zero replaces the old value.
  for(const points of versions)for(const p of points)if(quarterOrder(p.quarter)>=0&&quarterOrder(p.quarter)<=quarterOrder(cutoff))map.set(p.quarter,p);
  return [...map.values()].sort((a,b)=>quarterOrder(a.quarter)-quarterOrder(b.quarter));
}

/** Recover exact columns retained by the pre-v2 parser on the October Q3
 * import. Do not invent cells it discarded (targets and some opening values).
 * The previous parser retained E:AB, AY:BP and several scalar columns. */
export function recoverShiftedDelegate(detail: any, sourceDate: string, clientQuarters: any[][] = []) {
  const points=detail.quarters || [],active=quarterForMonth(sourceDate);
  if(points.length!==6||quarterOrder(active)!==quarterOrder(latestQuarter(points))+1)return detail;
  if(!points.some((p:any)=>!Number.isInteger(p.openingsCount)||p.openingsCount>1000||Math.abs(p.total-p.push-p.platform)>.1))return detail;
  const cells:Record<string,number>={};
  for(const [start,key] of [[5,'total'],[11,'platform'],[17,'push'],[23,'pharmacies200'],[51,'openingsCount'],[57,'openingsSales'],[63,'openingsAverage']] as const)
    points.forEach((p:any,i:number)=>{if(p[key]!=null)cells[columnName(start+i)]=Number(p[key]);});
  const base=quarterOrder(points[0].quarter),label=(offset:number)=>{const n=base+offset,y=Math.floor(n/4),q=n%4+1;return `Q${q} ${String(y).slice(-2)}-${String(y+1).slice(-2)}`;};
  const quarters=Array.from({length:7},(_,i)=>{
    const quarter=label(i),total=cells[columnName(5+i)],platform=cells[columnName(12+i)],push=cells[columnName(19+i)];
    const count=cells[columnName(58+i)],sales=cells[columnName(65+i)];
    const clients=clientQuarters.length?clientQuarters.filter(qs=>Number(qs.find(p=>p.quarter===quarter)?.total||0)>200).length:null;
    return {quarter,total,platform,push,directPct:total?push/total:null,platformPct:total?platform/total:null,pharmacies200:clients,openingsCount:count??null,openingsSales:sales??(count===0?0:null),openingsAverage:count===0?0:count&&sales!=null?sales/count:null,target200At85:null,target200At100:null};
  });
  if(quarters.some(p=>!Number.isFinite(p.total)||!Number.isFinite(p.platform)||!Number.isFinite(p.push)||Math.abs(p.total-p.platform-p.push)>.1))throw new Error('No se puede recuperar con seguridad el trimestre del archivo antiguo. Vuelve a incorporar el Excel original.');
  return {...detail,quarters,recoveredColumns:true,requiresOriginal:true};
}

export function recoverShiftedClient(points:any[], sourceDate:string) {
  if(points.length!==10||quarterName(points[0]?.quarter)||!quarterName(points[1]?.quarter))return points;
  const cells:Record<string,number>={};
  for(const [start,key] of [[78,'total'],[88,'platform'],[98,'push']] as const)points.forEach((p,i)=>{cells[columnName(start+i)]=Number(p[key]||0);});
  const base=quarterOrder(points[1].quarter),cutoff=quarterOrder(quarterForMonth(sourceDate));
  return Array.from({length:cutoff-base+1},(_,i)=>{
    const n=base+i,y=Math.floor(n/4),quarter=`Q${n%4+1} ${String(y).slice(-2)}-${String(y+1).slice(-2)}`,total=cells[columnName(79+i)],platform=cells[columnName(90+i)];
    if(!Number.isFinite(total)||!Number.isFinite(platform))throw new Error('Faltan columnas para recuperar la venta por farmacia. Recarga el Excel original.');
    return {quarter,total,platform,push:total-platform,directPct:total?(total-platform)/total:null,platformPct:total?platform/total:null};
  });
}

export function recoverMonthlySales(months:Record<string,number>,points:any[],sourceDate:string) {
  const key=sourceDate.slice(0,7),quarter=quarterForMonth(sourceDate);
  if(!(key in months)&&(Number(sourceDate.slice(5,7))-1)%3===0){
    const point=points.find(p=>p.quarter===quarter);
    if(point&&Number.isFinite(point.total))return {...months,[key]:point.total};
  }
  return months;
}

export function mergeProductHistory(versions:{rows:any[];months:string[]}[]) {
  const products=new Map<string,any>();
  for(const version of versions){
    // Each workbook is a complete observation of its covered months. Missing
    // references in that observation have zero purchases, not stale purchases.
    for(const item of products.values())for(const month of version.months)item.months[month]=0;
    for(const row of version.rows){
      const code=String(row.nationalCode??row.national_code),old=products.get(code);
      const months={...(old?.months||{}),...Object.fromEntries(version.months.map(m=>[m,0])),...row.months};
      products.set(code,{...old,...row,nationalCode:code,months});
    }
  }
  return [...products.values()];
}
