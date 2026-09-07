import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/salesDashboard.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText
  .replace(/^import .*;$/gm,'')
  .replace(/export /g,'');
const {purchasePattern,productTrend}=new Function(js+';return {purchasePattern,productTrend}')();

test('purchase patterns distinguish openings, sustained growth and stopped buying',()=>{
 assert.equal(purchasePattern([0,0,120]),'Apertura');
 assert.equal(purchasePattern([100,120,150]),'Crecimiento sostenido');
 assert.equal(purchasePattern([100,80,0]),'Compra detenida');
 assert.equal(purchasePattern([100,102,99]),'Estable');
});

test('product evolution compares monthly run rates instead of partial-quarter totals',()=>{
 const growing=productTrend({202604:30,202605:30,202606:30,202607:45},'202607');
 assert.equal(growing.status,'Crecimiento');
 assert.equal(growing.previousAvg,30);
 assert.equal(growing.currentAvg,45);
 const stopped=productTrend({202604:9,202605:12,202606:9},'202607');
 assert.equal(stopped.status,'Compra detenida');
});
