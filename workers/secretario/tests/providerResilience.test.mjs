import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

async function loadTs(path){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}

const messages=await loadTs('../src/chatMessages.ts');
const selection=await loadTs('../src/toolSelection.ts');

test('tool exchanges become portable text without provider-specific signatures',()=>{
 const input=[
  {role:'system',content:'Sistema'},
  {role:'user',content:'Busca la farmacia'},
  {role:'assistant',content:'',tool_calls:[{id:'call_1',name:'knowledge_search',arguments:{query:'Tirsana'}}]},
  {role:'tool',name:'knowledge_search',tool_call_id:'call_1',content:'Farmacia Tirsana'},
 ];
 const out=messages.portableMessages(input);
 assert.equal(out.some(x=>x.role==='tool'),false);
 assert.equal(out.some(x=>x.tool_calls),false);
 assert.match(out[2].content,/knowledge_search/);
 assert.match(out[3].content,/Resultado de herramienta knowledge_search/);
});

test('large histories are compacted before a provider request',()=>{
 const input=[{role:'system',content:'S'.repeat(20_000)}];
 for(let i=0;i<20;i++)input.push({role:i%2?'assistant':'user',content:String(i).repeat(5_000)});
 const out=messages.compactMessages(input,24_000);
 const chars=out.reduce((n,x)=>n+x.content.length,0);
 assert.ok(chars<=24_200,`contexto demasiado grande: ${chars}`);
 assert.match(out.at(-1).content,/19/);
});

test('the exact two-pharmacy request receives a small calendar toolset',()=>{
 const names=['think','get_time','memory_search','knowledge_search','knowledge_read','agenda','calendar_calendars','calendar_list','calendar_create','calendar_update','calendar_delete','pharmacy_visit_create','crm_synchronize','gmail_send','drive_read','gtasks_create','web_search','run_code'];
 const defs=names.map(name=>({name,description:name,parameters:{type:'object',properties:{}}}));
 const picked=selection.relevantToolDefs(defs,'Crea una visita a la farmacia TIRSANA a las 11:00 hoy y otra a la farmacia Pablo Uriarte a las 12:00');
 const got=picked.map(x=>x.name);
 assert.ok(got.includes('calendar_create'));
 assert.ok(got.includes('calendar_calendars'));
 assert.ok(got.includes('pharmacy_visit_create'));
 assert.ok(got.includes('knowledge_search'));
 assert.equal(got.includes('gmail_send'),false);
 assert.ok(picked.length<defs.length);
});

test('agent has a fast-chain circuit breaker and bounded tool results',()=>{
 const source=readFileSync(new URL('../src/agent.ts',import.meta.url),'utf8');
 assert.match(source,/cadena smart agotada; reintento fast/);
 assert.match(source,/chat\(env, 'fast'/);
 assert.match(source,/JSON\.stringify\(result\), 7000/);
});
