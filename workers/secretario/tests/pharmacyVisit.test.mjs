import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/pharmacyVisit.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {pharmacyVisitEvent}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const visit={pharmacy:'Farmacia de prueba',date:'2026-12-31',address:'Calle de prueba 1, 50001 Zaragoza',classification:'Premium',route:'Ruta 01',notes:'Revisar surtido',clientId:'00123'};
test('includes address, classification, route and original notes',()=>{
 const event=pharmacyVisitEvent(visit,'planning');
 assert.equal(event.location,visit.address);
 for(const text of ['Premium','Ruta 01','Revisar surtido','00123'])assert.ok(event.description.includes(text));
 assert.equal(event.calendar_id,'planning');
 assert.equal(event.end,'2027-01-01');
});
test('missing client fields prevent event creation',()=>{
 for(const key of ['address','classification','route'])assert.throws(()=>pharmacyVisitEvent({...visit,[key]:''},'planning'));
});
test('invalid dates are rejected',()=>{
 assert.throws(()=>pharmacyVisitEvent({...visit,date:'2026-02-30'},'planning'));
});
test('creates a timed visit when the reviewed proposal includes a time',()=>{
 const event=pharmacyVisitEvent({...visit,time:'10:30',durationMinutes:75},'planning');
 assert.equal(event.start,'2026-12-31T10:30:00');
 assert.equal(event.end,'2026-12-31T11:45:00');
 assert.ok(event.description.includes('10:30'));
});
