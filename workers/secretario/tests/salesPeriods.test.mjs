import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {strToU8,strFromU8,zipSync,unzipSync,Unzip,UnzipInflate} from 'fflate';

const compile=file=>ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'');
const periods=new Function(compile('salesPeriods.ts')+';return {SALES_SCHEMA_VERSION,SALES_PERIOD_VERSION,salesKey,quarterName,quarterOrder,quarterForMonth,latestQuarter,periodColumns,readPeriodSeries,mergeQuarterHistory,mergeProductHistory,recoverShiftedClient,recoverShiftedDelegate,recoverMonthlySales}')();
const api=new Function(...Object.keys(periods),'strFromU8','Unzip','UnzipInflate',compile('salesDashboard.ts')+';return {parseSalesDashboard,importSalesDashboard,reconcileQuotaWithOfficialCycles,listSalesImports,salesDashboardApi}')(...Object.values(periods),strFromU8,Unzip,UnzipInflate);
const col=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
const serial=(year,month,day=1)=>(Date.UTC(year,month-1,day)-Date.UTC(1899,11,30))/86400000;
const escape=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const sheet=rows=>'<worksheet><sheetData>'+Object.entries(rows).map(([r,cells])=>'<row r="'+r+'">'+Object.entries(cells).map(([c,value])=>typeof value==='number'?'<c r="'+c+r+'"><v>'+value+'</v></c>':'<c r="'+c+r+'" t="inlineStr"><is><t>'+escape(value)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';

function fixture(quarterCount=7,corrupt=false){
 const active=quarterCount===7?'Q3 26-27':'Q2 26-27',labels=['Q1 25-26','Q2 25-26','Q3 25-26','Q4 25-26','Q1 26-27','Q2 26-27','Q3 26-27'].slice(0,quarterCount),months=quarterCount===7?[7,8,9,10]:[7,8,9];
 const header={C:'Cod Del',D:'Delegado',E:'VDL',G:'Nombre de la Institución',H:'Clas. CRM',T:'YTD anterior',U:'YTD actual'},row={C:'BU 1002',D:'Delegada',E:'1',G:'Farmacia',H:'VIP',T:900,U:1500},groups={};
 let index=23;for(const m of months){header[col(index)]=serial(2026,m);row[col(index++)]=m===10?1000:100;}
 for(const [name,value] of [['OBJETIVO VENTA MENSUAL',2000],['FALTA PREV.',-1000],['COND. COMERCIAL','Acuerdo'],['Compromiso Fact Q',10000],['Inicio acuerdo',serial(2026,4)],['Fin acuerdo',serial(2027,3)],['Vigencia','12 meses'],['SERVICIO','Si'],['Acumulado Q',1000],['Fact Bruta Acum Acdo',2000],['FALTA',9000]]){header[col(index)]=name;row[col(index++)]=value;}
 groups[col(index)]='SEGUIMIENTO OTC';header[col(index)]='UNIGEL';row[col(index++)]=10;
 const block=(title,value)=>{groups[col(index)]=title;labels.forEach((q,i)=>{header[col(index)]=(q===active?'ACTUAL ':'')+q;row[col(index++)]=value(i,q);});};
 block('VENTA TOTAL',(i,q)=>q===active?1000:(i+1)*100);
 block('V. PLATAFORMA CICLO',(i,q)=>q===active?100:(i+1)*10);
 block('V. PUSH CICLO',(i,q)=>(q===active?1000:(i+1)*100)-(q===active?100:(i+1)*10)+(corrupt&&q===active?7:0));
 for(const [name,value] of [['Provincia','Madrid'],['Ciudad','Getafe'],['CP','28901'],['CCAA','Madrid'],['RUTA','Ruta 1']]){header[col(index)]=name;row[col(index++)]=value;}
 const cycleHeader={C:'CodDel',D:'Delegado'},cycleRow={C:'BU 1002',D:'Delegada'},cycleGroups={};index=5;
 for(const [title,value] of [['VENTA TOTAL',1000],['V. PLATAFORMA CICLO',100],['V. PUSH CICLO',900],['Farmacias Cumplen > 200€',1],['Pedidos Directos',20],['Pedidos Transfer',10],['% Directo sobre Transfer ( ni incluye P Negativas)',.5]]){
  cycleGroups[col(index)]=title;labels.forEach(q=>{cycleHeader[col(index)]=(q===active?'ACTUAL ':'')+q;cycleRow[col(index++)]=value;});
 }
 for(const [name,value] of [['Nº Crecen',1],['Nº Decrecen',0],['€ Crecen',500],['€ Decrecen',0]]){cycleHeader[col(index)]=name;cycleRow[col(index++)]=value;}
 for(const [title,value] of [['Aperturas Venta Push',2],['VRN PUSH Aperturas',400],['VRN PROMEDIO Aperturas',200]]){
  cycleGroups[col(index)]=title;labels.forEach(q=>{cycleHeader[col(index)]=(q===active?'ACTUAL ':'')+q;cycleRow[col(index++)]=value;});
 }
 const firstMonth=quarterCount===7?10:7,names=['Cuadro Mando','Cuota','Ciclos Cerrados','Presentaciones por Farmacia','Recuperaciones','Cliente-Presentacion'];
 const books=[{1:{H:serial(2026,quarterCount===7?10:9,13)},9:groups,10:header,11:row},
  {6:{C:'CodDel',D:'Delegado',F:serial(2026,firstMonth),G:serial(2026,firstMonth+1),H:serial(2026,firstMonth+2)},7:{C:'BU 1002',D:'Delegada',E:10000,I:quarterCount===7?1000:100,J:quarterCount===7?0:200,K:quarterCount===7?0:700},16:{D:'Delegada',E:10,F:12}},
  {6:cycleGroups,7:cycleHeader,8:cycleRow},
  {6:{A:'Cód Nacional',B:'Presentación',C:'BRAND',G:'Sep 26',H:'Oct 26',I:'Q2',J:'Q3',K:'Total'},7:{A:'123',B:'Molécula 10 mg',C:'BRAND',G:10,H:20,I:10,J:20,K:30}},
  {6:{G:'Sep 26'},7:{C:'1',G:10}},
  {7:{C:'1',E:'123',F:'Molécula 10 mg',G:10,H:'202609'},8:{C:'1',E:'123',F:'Molécula 10 mg',G:20,H:'202610'}}];
 const files={'xl/workbook.xml':strToU8('<workbook><sheets>'+names.map((name,i)=>'<sheet name="'+name+'" r:id="r'+i+'"/>').join('')+'</sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships>'+names.map((_,i)=>'<Relationship Id="r'+i+'" Target="worksheets/sheet'+i+'.xml"/>').join('')+'</Relationships>')};
 books.forEach((rows,i)=>files['xl/worksheets/sheet'+i+'.xml']=strToU8(sheet(rows)));
 return zipSync(files);
}

test('new quarter insertion moves every group without reusing the previous Q',()=>{
 const j=api.parseSalesDashboard(fixture(),'Q3.xlsx');
 assert.equal(j.metadata.currentQuarter,'Q3 26-27');
 assert.equal(j.delegates[0].quarters.length,7);
 assert.deepEqual(j.delegates[0].quarters.at(-1),{quarter:'Q3 26-27',total:1000,platform:100,push:900,directPct:.9,platformPct:.1,projected:j.delegates[0].quarters.at(-1).projected,pharmacies200:1,openingsCount:2,openingsSales:400,openingsAverage:200,target200At85:10,target200At100:12});
 assert.equal(j.quota[0].sale1,1000);assert.equal(j.quota[0].sale2,0);assert.equal(j.quota[0].sale3,0);
 assert.equal(j.clients[0].route,'Ruta 1');assert.equal(j.clients[0].objective,2000);
 assert.equal(j.clientDetails[0].agreement.commitment,10000);
 assert.deepEqual(j.clientDetails[0].otc,[{name:'UNIGEL',quantity:10,purchased:true}]);
 assert.equal(j.productDetails[0].months['202610'],20);
 assert.equal(j.products[0].unitsCurrent,20);
});
test('a zero in the new Q remains current, and inconsistent sales cannot be published',()=>{
 assert.equal(periods.latestQuarter([{quarter:'Q2 26-27',total:100},{quarter:'Q3 26-27',total:0}]),'Q3 26-27');
 assert.throws(()=>api.parseSalesDashboard(fixture(7,true),'bad.xlsx'),/push \+ plataforma/);
});
test('empty merged and styled cells do not end a quarter block',()=>{
 const columns=periods.periodColumns({E:'Q2 26-27',F:'ACTUAL Q3 26-27',G:'Q2 26-27'},{E:'VENTA TOTAL',F:null,G:'PLATAFORMA'},'VENTA TOTAL');
 assert.deepEqual(columns.map(p=>p.quarter),['Q2 26-27','Q3 26-27']);
});
test('section headings shifted by new columns use complete runs without crossing metrics',()=>{
 const headers={D:'OTC',E:'Q1 26-27',F:'Q2 26-27',G:'ACTUAL Q3 26-27',H:'Q1 26-27',I:'Q2 26-27',J:'ACTUAL Q3 26-27',K:'Q1 26-27',L:'Q2 26-27',M:'ACTUAL Q3 26-27'};
 // The platform title is two cells to the right of the data block after a
 // quarter insertion. The old boundary included H:I and rejected duplicates.
 const groups={D:'SEGUIMIENTO OTC',E:'VENTA TOTAL',J:'V. PLATAFORMA CICLO',M:'V. PUSH CICLO'};
 assert.deepEqual(periods.periodColumns(headers,groups,'VENTA TOTAL').map(x=>x.column),['E','F','G']);
 assert.deepEqual(periods.periodColumns(headers,groups,'V. PLATAFORMA CICLO').map(x=>x.column),['H','I','J']);
 assert.deepEqual(periods.periodColumns(headers,groups,'V. PUSH CICLO').map(x=>x.column),['K','L','M']);
});
test('quarter labels accept typographic hyphens and complete fiscal years',()=>{
 assert.equal(periods.quarterName('ACTUAL VRN\nQ3 2026‑2027'),'Q3 26-27');
 assert.equal(periods.quarterName('Q3 26−27'),'Q3 26-27');
 assert.equal(periods.quarterName('Q3 26-26'),'');
});
test('genuine duplicate or ambiguous quarters remain rejected with useful cell diagnostics',()=>{
 assert.throws(()=>periods.periodColumns({E:'Q1 26-27',F:'Q2 26-27',G:'Q2 26-27',H:'ACTUAL Q3 26-27',I:'Q1 26-27'},{E:'VENTA TOTAL',I:'V. PLATAFORMA CICLO'},'VENTA TOTAL','Cuadro Mando, fila 10'),/Cuadro Mando, fila 10.*G: Q2 26-27/);
 assert.throws(()=>periods.periodColumns({E:'ACTUAL Q2 26-27',F:'ACTUAL Q3 26-27'},{E:'VENTA TOTAL'},'VENTA TOTAL'),/seguridad/);
});
test('full import handles shifted section headings and typographic fiscal labels',()=>{
 const files=unzipSync(fixture());
 for(const path of ['xl/worksheets/sheet0.xml','xl/worksheets/sheet2.xml']) {
  let xml=strFromU8(files[path]);
  xml=xml.replace(/26-27/g,'2026‑2027');
  const groupRow=path.endsWith('sheet0.xml')?9:6;
  xml=xml.replace(new RegExp('(<row r="'+groupRow+'">)([\\s\\S]*?)(</row>)'),(_,a,body,c)=>a+body.replace(/(<c r=")([A-Z]+)(\d+")/g,(_m,prefix,letters,suffix)=>{
    const n=[...letters].reduce((v,ch)=>v*26+ch.charCodeAt(0)-64,0);
    return prefix+col(n+1)+suffix;
  })+c);
  files[path]=strToU8(xml);
 }
 const parsed=api.parseSalesDashboard(zipSync(files),'Q3-shifted.xlsx');
 assert.equal(parsed.metadata.currentQuarter,'Q3 26-27');
 assert.equal(parsed.delegates[0].quarters.at(-1).total,1000);
 assert.equal(parsed.clientDetails[0].quarters.at(-1).total,1000);
});
test('history deduplicates versions by Q and preserves newer corrections including zero',()=>{
 const rows=periods.mergeQuarterHistory([[{quarter:'Q1 26-27',total:5},{quarter:'Q2 26-27',total:100}],[{quarter:'Q2 26-27',total:0},{quarter:'Q3 26-27',total:10}]],'Q3 26-27');
 assert.deepEqual(rows.map(x=>x.total),[5,0,10]);
 assert.deepEqual(periods.mergeQuarterHistory([rows],'Q2 26-27').map(x=>x.total),[5,0]);
});
test('product history joins months, overwrites overlapping values and records absent references as zero',()=>{
 const rows=periods.mergeProductHistory([{months:['202609'],rows:[{nationalCode:'1',months:{202609:10}},{nationalCode:'2',months:{202609:9}}]},{months:['202609','202610'],rows:[{nationalCode:'1',months:{202609:0,202610:3}}]}]);
 assert.deepEqual(rows.find(x=>x.nationalCode==='1').months,{202609:0,202610:3});
 assert.deepEqual(rows.find(x=>x.nationalCode==='2').months,{202609:0,202610:0});
});
test('published snapshots are selected by financial quarter before file date',async()=>{
 const imports=[{id:'old',current_quarter:'Q2 26-27',source_date:'2026-10-30',imported_at:'2026-10-30'},{id:'new',current_quarter:'Q3 26-27',source_date:'2026-10-13',imported_at:'2026-10-21'}];
 const selected=await api.listSalesImports({DB:{prepare(sql){assert.match(sql,/WHERE ready=1/);return{all:async()=>({results:imports})}}}});
 assert.equal(selected[0].id,'new');
});

test('October legacy columns recover Q3 rather than relabelling Q2 amounts',()=>{
 const cells={};
 for(let i=0;i<7;i++){
   cells[col(5+i)]=i===6?41_171.08:100+i;
   cells[col(12+i)]=i===6?0:10+i;
   cells[col(19+i)]=cells[col(5+i)]-cells[col(12+i)];
   cells[col(58+i)]=i===6?0:2;
   cells[col(65+i)]=200;
 }
 const labels=['Q1 25-26','Q2 25-26','Q3 25-26','Q4 25-26','Q1 26-27','Q2 26-27'];
 const legacy=labels.map((quarter,i)=>({quarter,...Object.fromEntries([[5,'total'],[11,'platform'],[17,'push'],[23,'pharmacies200'],[51,'openingsCount'],[57,'openingsSales'],[63,'openingsAverage']].map(([start,key])=>[key,cells[col(start+i)]||0]))}));
 const fixed=periods.recoverShiftedDelegate({quarters:legacy},'2026-10-13');
 assert.equal(fixed.quarters.at(-1).quarter,'Q3 26-27');
 assert.equal(fixed.quarters.at(-1).total,41171.08);
 assert.equal(fixed.quarters.at(-1).push,41171.08);
 assert.equal(fixed.quarters.at(-1).openingsCount,0);
 assert.equal(fixed.quarters.at(-1).target200At100,null);
 assert.equal(fixed.requiresOriginal,true);
});

test('only a completed import becomes visible and the original XLSX is retained',async()=>{
 const statements=[];
 const DB={prepare(sql){const stmt={sql,bind(...values){stmt.values=values;return stmt},async run(){statements.push(stmt);return{success:true}}};return stmt},async batch(stmts){statements.push(...stmts);return stmts.map(()=>({success:true}))}};
 await api.importSalesDashboard({DB},fixture(),'new.xlsx','telegram','test');
 const archive=statements.find(x=>x.sql.startsWith('INSERT INTO sales_dashboard_sources'));
 assert.ok(archive.values[2] instanceof ArrayBuffer);
 assert.match(statements[0].sql,/ready\) VALUES\([?,]+0\)/);
 assert.match(statements.at(-1).sql,/SET ready=1/);
 assert.ok(!statements.some(x=>/DELETE FROM/.test(x.sql)));
});
test('rejected imports retain the original bytes without publishing a new snapshot',async()=>{
 const statements=[];
 const DB={prepare(sql){const stmt={sql,bind(...values){stmt.values=values;return stmt},async run(){statements.push(stmt);return{success:true}}};return stmt}};
 const bytes=fixture(7,true);
 await assert.rejects(api.importSalesDashboard({DB},bytes,'rejected.xlsx','web','owner@example.com'),error=>{
  assert.match(error.uploadId,/^rejected-/);assert.match(error.message,/conservado/);return true;
 });
 const stored=statements.filter(x=>x.sql.startsWith('INSERT INTO sales_dashboard_sources'));
 assert.deepEqual(new Uint8Array(stored[0].values[2]),bytes);
 assert.ok(statements.some(x=>x.sql.startsWith('INSERT INTO sales_dashboard_rejected_uploads')));
 assert.ok(!statements.some(x=>x.sql.startsWith('INSERT INTO sales_dashboard_imports')||x.sql.includes('SET ready=1')));
});
test('rejected files and retry are restricted to the owner before any database access',async()=>{
 for(const path of ['rejected-upload','retry']) {
  const response=await api.salesDashboardApi(new Request('https://example.com/api/sales-dashboard/'+path,{method:path==='retry'?'POST':'GET'}),{OWNER_EMAIL:'owner@example.com',DB:{prepare(){throw new Error('must not read private source')}}},'other@example.com');
  assert.equal(response.status,403);
 }
});
test('retrying an already imported source is idempotent',async()=>{
 const id='rejected-00000000-0000-0000-0000-000000000001';
 const response=await api.salesDashboardApi(new Request('https://example.com/api/sales-dashboard/retry',{method:'POST',body:JSON.stringify({uploadId:id})}),{OWNER_EMAIL:'owner@example.com',DB:{prepare(sql){assert.match(sql,/SELECT \*/);return{bind(){return this},async first(){return{id,byte_size:100,resolved_import_id:'existing'}}}}}},'owner@example.com');
 assert.equal(response.status,200);assert.equal((await response.json()).import.id,'existing');
});
test('retries reject incomplete archived files before publishing',async()=>{
 const id='rejected-00000000-0000-0000-0000-000000000001';
 const DB={prepare(sql){return{bind(){return this},async first(){return{id,byte_size:100}},async all(){return{results:[{chunk_index:0,content:[1,2]}]}}}}};
 const response=await api.salesDashboardApi(new Request('https://example.com/api/sales-dashboard/retry',{method:'POST',body:JSON.stringify({uploadId:id})}),{OWNER_EMAIL:'owner@example.com',DB},'owner@example.com');
 assert.equal(response.status,400);assert.match((await response.json()).error,/incompleto/);
});
test('an archived original can be retried through the API and published completely',async()=>{
 const id='rejected-00000000-0000-0000-0000-000000000001',bytes=fixture(),writes=[];
 const DB={prepare(sql){const stmt={sql,bind(...values){stmt.values=values;return stmt},async first(){return{id,byte_size:bytes.length,source_name:'Q3.xlsx',source_channel:'telegram'}},async all(){return{results:[{chunk_index:0,content:Array.from(bytes.slice(0,100))},{chunk_index:1,content:Array.from(bytes.slice(100))}]}},async run(){writes.push(stmt);return{success:true}}};return stmt},async batch(items){writes.push(...items);return items.map(()=>({success:true}))}};
 const response=await api.salesDashboardApi(new Request('https://example.com/api/sales-dashboard/retry',{method:'POST',body:JSON.stringify({uploadId:id})}),{OWNER_EMAIL:'owner@example.com',DB},'owner@example.com');
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.import.currentQuarter,'Q3 26-27');
 const published=writes.find(x=>x.sql.includes('SET ready=1'));
 assert.equal(published.values[0],body.import.id);
 assert.ok(writes.some(x=>x.sql.includes('SET resolved_import_id=')&&x.values[1]===id));
});
