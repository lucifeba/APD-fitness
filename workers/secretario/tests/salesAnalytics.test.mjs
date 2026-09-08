import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';

const source=readFileSync(new URL('../src/salesAnalytics.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/^import .*;$/gm,'')
  .replace(/export /g,'');
const {ytdStatus,buildSalesAnalytics,openingsWorkbook}=new Function('strToU8','zipSync',js+';return {ytdStatus,buildSalesAnalytics,openingsWorkbook}')(strToU8,zipSync);

const row=(values={})=>({vdl:'1',cod_del:'D1',delegate:'Delegada 1',client:'Farmacia Uno',classification:'VIP',route:'Centro',previous_vrn:100,current_vrn:50,variation:-50,monthly_sales:{'2026-08':20,'2026-09':0},quarters_json:[{quarter:'Q1 24-25',total:0},{quarter:'Q2 24-25',total:0},{quarter:'Q3 24-25',total:0},{quarter:'Q4 24-25',total:0},{quarter:'Q1 25-26',total:0},{quarter:'Q2 25-26',total:100},{quarter:'Q3 25-26',total:200}],...values});

test('YTD status never labels a negative variation as growth',()=>{
  assert.equal(ytdStatus(100,50),'Decrecimiento');
  assert.equal(ytdStatus(0,50),'Apertura');
  assert.equal(ytdStatus(50,0),'Compra detenida');
});

test('openings are assigned once to the first positive quarter after the 24-25 baseline',()=>{
  const result=buildSalesAnalytics([row(),row({vdl:'2',client:'Farmacia Dos',cod_del:'D2',delegate:'Delegada 2',previous_vrn:70,current_vrn:60,monthly_sales:{'2026-09':10},quarters_json:[{quarter:'Q1 24-25',total:25},{quarter:'Q1 25-26',total:0},{quarter:'Q2 25-26',total:60}]})]);
  const q2=result.openingsByQuarter.find(x=>x.quarter==='Q2 25-26');
  assert.equal(q2.count,1);
  assert.equal(q2.sales,100);
  assert.equal(result.openingsByQuarter.reduce((n,x)=>n+x.count,0),1);
  assert.equal(result.changes.find(x=>x.vdl==='1').ytd_status,'Decrecimiento');
  assert.equal(result.changes.find(x=>x.vdl==='1').gap_to_equal_ytd,null);
  assert.equal(result.changes.find(x=>x.vdl==='2').gap_to_equal_ytd,10);
});

test('quarterly opening export is a real two-sheet xlsx',()=>{
  const data=buildSalesAnalytics([row()]);
  const files=unzipSync(openingsWorkbook(data.openingsByQuarter));
  assert.ok(files['xl/worksheets/sheet1.xml']);
  assert.ok(files['xl/worksheets/sheet2.xml']);
  assert.match(strFromU8(files['xl/workbook.xml']),/Resumen por Q/);
  assert.match(strFromU8(files['xl/worksheets/sheet2.xml']),/Farmacia Uno/);
});
