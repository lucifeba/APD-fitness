import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { strFromU8, strToU8, zipSync, Unzip, UnzipInflate } from 'fflate';

const source=readFileSync(new URL('../src/delegateKpis.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'');
const {parseDelegateKpiWorkbook,aggregateDelegateKpis,DELEGATE_KPI_DEFINITIONS}=new Function('strFromU8','Unzip','UnzipInflate',js+';return {parseDelegateKpiWorkbook,aggregateDelegateKpis,DELEGATE_KPI_DEFINITIONS}')(strFromU8,Unzip,UnzipInflate);

const xml=s=>strToU8(s);
const cell=(ref,value)=>typeof value==='number'?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${value??''}</t></is></c>`;
function workbook(sheetName,rows){
  const sheetRows=rows.map((values,index)=>`<row r="${index+1}">${values.map((value,column)=>cell(String.fromCharCode(65+column)+(index+1),value)).join('')}</row>`).join('');
  return zipSync({
    'xl/workbook.xml':xml(`<workbook><sheets><sheet name="${sheetName}" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels':xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':xml(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

test('planning parser preserves delegate, client identity, route and classification',()=>{
  const file=workbook('Amaro Soteras, 385012 Patricia',[
    ['Fecha','Tipo','Quien','Dirección','ID externo 1','NIF',"Clasificación FY'25-26",'.RUTAS','Ciudad'],
    [46266,'Visita Farmacia','FARMACIA UNO','Calle Uno','WESF1','B123','2. Vip','RUTA 01','MADRID'],
  ]);
  const parsed=parseDelegateKpiWorkbook(file,'planning');
  assert.equal(parsed.period,'2026-09');
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.rows[0].delegateKey,'385012');
  assert.equal(parsed.rows[0].clientKey,'nif:b123');
  assert.equal(parsed.rows[0].route,'RUTA 01');
  assert.equal(parsed.rows[0].classification,'2. Vip');
});

test('report parser fills down the delegate and identifies effective visits',()=>{
  const file=workbook('Act_CallReport_Rutas_ES',[
    ['User','Fecha','Tipo de actividad','NIF ','Quien','RUTAS',"Clasificación FY'26-27",'Tipo de visita','Próximos objetivos'],
    ['Amaro Soteras, 385012 Patricia Marta',46266,'Visita Farmacia','B123','FARMACIA UNO','RUTA 01','2. Vip','Visita efectiva','Cerrar pedido'],
    ['',46267,'Visita Farmacia','B456','FARMACIA DOS','RUTA 02','7. No cliente','Visita no efectiva',''],
  ]);
  const parsed=parseDelegateKpiWorkbook(file,'report');
  assert.equal(parsed.rows.length,2);
  assert.deepEqual(parsed.rows.map(row=>row.delegateKey),['385012','385012']);
  assert.deepEqual(parsed.rows.map(row=>row.effective),[1,0]);
  assert.equal(parsed.rows[0].nextStep,'Cerrar pedido');
});

test('the individual action plan covers every KPI supplied by Ara',()=>{
  assert.equal(DELEGATE_KPI_DEFINITIONS.length,10);
  assert.deepEqual(DELEGATE_KPI_DEFINITIONS.map(item=>item.id),['push_growth','opportunity_pharmacies','opportunity_progress','decline_recovery','appointments','effective_visits','nonclient_openings','objections','route_compliance','next_steps']);
});

test('operational KPIs only count visits made by the planned delegate on the planned day',()=>{
  const row=(values={})=>({rowNumber:1,activityDate:'2026-09-01',delegateKey:'385012',delegate:'Patricia',clientKey:'nif:b123',pharmacy:'Farmacia Uno',nif:'B123',externalId:'',classification:'2. Vip',route:'Ruta 1',address:'',city:'',effective:null,orderDone:'',accompanied:'',visitTime:'',conclusions:'',nextStep:'',growthProposal:'',...values});
  const planning=[row(),row({rowNumber:2,clientKey:'nif:b456',pharmacy:'Farmacia Dos',classification:'7. No cliente'})];
  const reports=[row({effective:1,nextStep:'Enviar propuesta'}),row({rowNumber:2,clientKey:'nif:b456',pharmacy:'Farmacia Dos',classification:'7. No cliente',activityDate:'2026-09-02',effective:1})];
  const result=aggregateDelegateKpis(planning,reports,{sourceDate:'',rows:[]});
  assert.equal(result.metrics.sameDay,1);
  assert.equal(result.metrics.compliance,.5);
  assert.equal(result.metrics.effectiveness,1);
  assert.equal(result.metrics.coverage,1);
  assert.equal(result.metrics.nonclientOpenings,1);
  assert.equal(result.metrics.nextSteps,1);
});
