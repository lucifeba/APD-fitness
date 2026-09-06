import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/planning.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { proposeAccompaniments } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const row = (date, delegate, region='Madrid',route='ruta 1',pharmacies=['Farmacia A']) => ({date,delegate,region,route,pharmacies});
const base = {month:'2026-09',anchorMonday:'2026-08-31',anchorRegion:'Madrid',history:[]};
test('only Tue–Thu and matching alternate region; no calendar writes',()=>{
 const result=proposeAccompaniments({...base,routes:[row('2026-09-01','Ana'),row('2026-09-04','Ana'),row('2026-09-08','Ana'),row('2026-09-08','Luis','Aragón')]});
 assert.deepEqual(result.selected.map(r=>r.delegate),['Ana','Luis']);
 assert.equal(result.calendarEventsCreated,0);
 assert.equal(result.status,'pending_approval');
 assert.ok(result.missing.length>0);
});
test('rotates delegates and avoids previously accompanied route',()=>{
 const result=proposeAccompaniments({...base,history:[row('2026-08-25','Ana')],routes:[row('2026-09-01','Ana'),row('2026-09-01','Ana','Madrid','ruta 2',['Farmacia B']),row('2026-09-02','Ana'),row('2026-09-02','Bea')]});
 assert.equal(result.selected[0].route,'ruta 2');
 assert.equal(result.selected[1].delegate,'Bea');
});
test('rejects invalid calendar dates and non-Monday anchor',()=>{
 assert.throws(()=>proposeAccompaniments({...base,anchorMonday:'2026-09-01',routes:[]}));
 assert.throws(()=>proposeAccompaniments({...base,routes:[row('2026-09-31','Ana')]}));
});
