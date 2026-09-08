import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/planningStore.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');

test('operational reconciliation covers Excel, visits and accompaniments',()=>{
 assert.match(source,/importCrmExcel\(env,'automatic-excel-sync'\)/);
 assert.match(source,/calendarList\(env,from,to,1000,cals\.planning\.id\)/);
 assert.match(source,/calendarList\(env,from,to,1000,cals\.accompaniments\.id\)/);
 assert.match(source,/syncCrmExcel\(env\)/);
 assert.match(source,/last_operational_sync/);
});

test('Ara runs reconciliation every 30 minutes even without a Telegram heartbeat',()=>{
 assert.match(config,/"ara"[\s\S]*?"triggers": \{ "crons": \["\*\/30 \* \* \* \*"\] \}/);
 assert.match(worker,/const jobs:Promise<unknown>\[\]=\[syncOperationalData\(env\)/);
 assert.doesNotMatch(worker,/if \(!owner\) return;/);
});
