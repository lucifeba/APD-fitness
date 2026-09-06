import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/crm.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {validateCrm,crmApi}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const data={Fecha:'2026-09-08',Delegado:'Delegado de prueba',Cliente:'Farmacia de prueba'};
test('CRM rejects impossible dates and protected fields',()=>{
 assert.throws(()=>validateCrm('visits',{...data,Fecha:'2026-02-30'}));
 assert.throws(()=>validateCrm('visits',{...data,'ID evento Google':'overwrite'}));
 assert.throws(()=>validateCrm('visits',{...data,Cliente:''}));
});
test('a stale edit returns a conflict and does not claim Excel synchronization',async()=>{
 const env={DB:{prepare(){return {bind(){return {run:async()=>({meta:{changes:0}})}}}}}};
 const result=await crmApi(new Request('https://example.com/api/crm',{method:'PUT',body:JSON.stringify({id:'test',section:'visits',version:1,data})}),env,'owner@example.com');
 assert.equal(result.status,409);
 assert.match((await result.json()).error,/Otro dispositivo/);
});
