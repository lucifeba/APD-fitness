import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/salesDashboard.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/^import .*;$/gm,'')
  .replace(/export /g,'');
const {purchasePattern,productTrend,aggregateMoleculeProducts}=new Function(js+';return {purchasePattern,productTrend,aggregateMoleculeProducts}')();

test('purchase patterns distinguish openings, sustained growth and stopped buying',()=>{
 assert.equal(purchasePattern([0,0,120]),'Apertura');
 assert.equal(purchasePattern([100,120,150]),'Crecimiento sostenido');
 assert.equal(purchasePattern([100,80,0]),'Compra detenida');
 assert.equal(purchasePattern([100,102,99]),'Estable');
});

test('product evolution compares quarters and only marks a loss after five months',()=>{
 const growing=productTrend({202604:30,202605:30,202606:30,202607:45,202608:45,202609:45},'202609');
 assert.equal(growing.status,'Aumento de compra');
 assert.equal(growing.previousUnits,90);
 assert.equal(growing.currentUnits,135);
 assert.equal(growing.projectedUnits,135);
 assert.equal(growing.changePct,.5);

 const stable=productTrend({202604:30,202605:30,202606:30,202607:30,202608:30,202609:30},'202609');
 assert.equal(stable.status,'Compra estable');

 const declining=productTrend({202604:30,202605:30,202606:30,202607:15,202608:15,202609:15},'202609');
 assert.equal(declining.status,'Descenso de compra');

 const lost=productTrend({202604:7,202605:0,202606:0,202607:0,202608:0,202609:0},'202609');
 assert.equal(lost.status,'Molécula perdida');
 assert.equal(lost.monthsWithoutPurchase,5);
 assert.equal(lost.lastPurchaseMonth,'202604');

 const recovered=productTrend({202601:10,202602:0,202603:0,202604:0,202605:0,202606:0,202607:10},'202607');
 assert.equal(recovered.status,'Molécula recuperada');

 const opened=productTrend({202604:0,202605:0,202606:0,202607:10},'202607');
 assert.equal(opened.status,'Nueva compra');
});

test('presentation rows aggregate by molecule before interpreting evolution',()=>{
 const rows=aggregateMoleculeProducts([
  {nationalCode:'1',brand:'Mol A',presentation:'Mol A 10 mg',months:{202604:10,202605:10,202606:10,202607:15,202608:15,202609:15}},
  {nationalCode:'2',brand:'Mol A',presentation:'Mol A 20 mg',months:{202604:20,202605:20,202606:20,202607:30,202608:30,202609:30}},
 ],'202609');
 assert.equal(rows.length,1);
 assert.equal(rows[0].molecule,'Mol A');
 assert.equal(rows[0].presentationCount,2);
 assert.equal(rows[0].brand,'Mol A');
 assert.equal(rows[0].children.length,2);
 assert.deepEqual(rows[0].children.map(x=>x.nationalCode),['2','1']);
 assert.equal(rows[0].total,225);
 assert.equal(rows[0].children[0].total,150);
 assert.equal(rows[0].previousUnits,90);
 assert.equal(rows[0].projectedUnits,135);
 assert.equal(rows[0].status,'Aumento de compra');
});
