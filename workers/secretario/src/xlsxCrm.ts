import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type WorkbookFiles = Record<string,Uint8Array>;
const entityDecode = (s:string) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const entityEncode = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colNumber = (letters:string) => [...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
const colLetters = (number:number) => { let s=''; while(number){number--;s=String.fromCharCode(65+number%26)+s;number=Math.floor(number/26)} return s; };
const serialToDate = (value:string) => new Date(Date.UTC(1899,11,30)+Number(value)*86400000).toISOString().slice(0,10);
const dateToSerial = (value:string) => String(Math.round((Date.parse(`${value}T00:00:00Z`)-Date.UTC(1899,11,30))/86400000));

export function openXlsx(bytes:Uint8Array) {
  const files=unzipSync(bytes);
  const text=(name:string)=>strFromU8(files[name]);
  const shared=[...text('xl/sharedStrings.xml').matchAll(/<x:si>([\s\S]*?)<\/x:si>/g)].map(m=>entityDecode([...m[1].matchAll(/<x:t(?: [^>]*)?>([\s\S]*?)<\/x:t>/g)].map(x=>x[1]).join('')));
  const workbook=text('xl/workbook.xml');
  const rels=text('xl/_rels/workbook.xml.rels');
  const sheetPath=(name:string) => {
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const rid=workbook.match(new RegExp(`<x:sheet name="${escaped}"[^>]*r:id="([^"]+)"`))?.[1];
    if(!rid) throw new Error(`No existe la hoja ${name}.`);
    const target=rels.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if(!target) throw new Error(`No se pudo resolver la hoja ${name}.`);
    return target.replace(/^\//,'');
  };
  return {files,shared,sheetPath,text};
}

function cellValue(xml:string, shared:string[]):string {
  const type=xml.match(/<x:c\b[^>]*\bt="([^"]+)"/)?.[1];
  if(type==='inlineStr') return entityDecode([...xml.matchAll(/<x:t(?: [^>]*)?>([\s\S]*?)<\/x:t>/g)].map(x=>x[1]).join(''));
  const raw=xml.match(/<x:v>([\s\S]*?)<\/x:v>/)?.[1] ?? '';
  return type==='s' ? (shared[Number(raw)] ?? '') : entityDecode(raw);
}

export function readSheet(bytes:Uint8Array,name:string) {
  const book=openXlsx(bytes), path=book.sheetPath(name), xml=book.text(path);
  const rows=[...xml.matchAll(/<x:row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/x:row>/g)].map(m=>({row:Number(m[1]),xml:m[2]}));
  const parsed=rows.map(({row,xml})=>{
    const cells:Record<string,string>={};
    for(const m of xml.matchAll(/<x:c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/x:c>)/g)) cells[m[1]]=cellValue(m[0],book.shared);
    return {row,cells};
  });
  const headerRow=parsed.find(r=>r.row===5); if(!headerRow) throw new Error(`La hoja ${name} no tiene cabeceras en la fila 5.`);
  const headers:Record<string,string>={}; for(const [col,value] of Object.entries(headerRow.cells)) if(value) headers[value]=col;
  const data=parsed.filter(r=>r.row>=6&&Object.values(r.cells).some(Boolean)).map(r=>({row:r.row,values:Object.fromEntries(Object.entries(headers).map(([h,c])=>[h,r.cells[c]||'']))}));
  return {headers,data};
}

function writtenCell(ref:string,value:string,style:string,date:boolean,numeric:boolean) {
  const attrs=` r="${ref}"${style?` s="${style}"`:''}`;
  if(!value) return `<x:c${attrs}/>`;
  if(date) return `<x:c${attrs}><x:v>${dateToSerial(value)}</x:v></x:c>`;
  if(numeric && /^-?\d+(?:\.\d+)?$/.test(value)) return `<x:c${attrs}><x:v>${value}</x:v></x:c>`;
  return `<x:c${attrs} t="inlineStr"><x:is><x:t xml:space="preserve">${entityEncode(value)}</x:t></x:is></x:c>`;
}

export function patchSheet(bytes:Uint8Array,name:string,updates:{row:number;values:Record<string,string>}[], numericHeaders:string[]=[]) {
  const book=openXlsx(bytes), path=book.sheetPath(name); let xml=book.text(path);
  const {headers}=readSheet(bytes,name); const inverse=Object.fromEntries(Object.entries(headers).map(([h,c])=>[c,h]));
  for(const update of updates) {
    const match=xml.match(new RegExp(`<x:row\\b[^>]*\\br="${update.row}"[^>]*>[\\s\\S]*?<\\/x:row>`));
    if(!match) throw new Error(`La fila ${update.row} no existe en ${name}.`);
    let row=match[0];
    for(const [header,value] of Object.entries(update.values)) {
      const col=headers[header]; if(!col) continue; const ref=`${col}${update.row}`;
      const re=new RegExp(`<x:c\\b[^>]*\\br="${ref}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/x:c>)`);
      const old=row.match(re)?.[0]; const style=old?.match(/\bs="([^"]+)"/)?.[1]||'';
      const next=writtenCell(ref,value,style,/fecha/i.test(header),numericHeaders.includes(header));
      if(old) row=row.replace(old,next); else {
        const cells=[...row.matchAll(/<x:c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/x:c>)/g)];
        const after=cells.find(c=>colNumber(c[1])>colNumber(col));
        row=after?row.replace(after[0],next+after[0]):row.replace('</x:row>',next+'</x:row>');
      }
    }
    xml=xml.replace(match[0],row);
  }
  book.files[path]=strToU8(xml); return zipSync(book.files,{level:6});
}

export function nextEmptyRows(bytes:Uint8Array,name:string,count:number) {
  const {data}=readSheet(bytes,name); const used=new Set(data.map(r=>r.row)); const rows:number[]=[];
  for(let row=6;row<=1000&&rows.length<count;row++) if(!used.has(row)) rows.push(row);
  if(rows.length<count) throw new Error(`No quedan suficientes filas libres en ${name}.`); return rows;
}

export function displayValue(header:string,value:string) { return /fecha/i.test(header)&&/^\d+(?:\.\d+)?$/.test(value)?serialToDate(value):value; }
