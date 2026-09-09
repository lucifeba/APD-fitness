import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/pendingTaskDigest.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
 .replace(/^import .*;$/gm,'')
 .replace(/export /g,'');
const {buildPendingDigest,PENDING_DIGEST_MARKER}=new Function(js+';return {buildPendingDigest,PENDING_DIGEST_MARKER}')();

test('creates one all-day digest with every genuine overdue task',()=>{
 const digest=buildPendingDigest([
  {id:'1',title:'Enviar propuesta',due:'2026-09-08',list:'Araceli',listId:'a'},
  {id:'2',title:'Llamar a farmacia',due:'2026-09-07',list:'Trabajo',listId:'b'},
 ],'2026-09-08','2026-09-09');
 assert.equal(digest.title,'Pendientes por completar (2)');
 assert.equal(digest.dueIso,'2026-09-09T00:00:00.000Z');
 assert.match(digest.notes,/Enviar propuesta/);
 assert.match(digest.notes,/Lista: Trabajo/);
});

test('does not recursively include an older Aravitas pending digest',()=>{
 const digest=buildPendingDigest([
  {id:'old',title:'Pendientes por completar (3)',due:'2026-09-08',notes:PENDING_DIGEST_MARKER+':2026-09-07',list:'Araceli',listId:'a'},
  {id:'real',title:'Preparar call',due:'2026-09-08',list:'Araceli',listId:'a'},
 ],'2026-09-08','2026-09-09');
 assert.equal(digest.count,1);
 assert.match(digest.notes,/Preparar call/);
 assert.doesNotMatch(digest.notes,/Pendientes por completar \(3\)/);
});

test('does not create an empty digest',()=>{
 assert.equal(buildPendingDigest([],'2026-09-08','2026-09-09'),null);
});
