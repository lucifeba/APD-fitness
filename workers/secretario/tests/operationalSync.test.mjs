import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/planningStore.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const googleTools=readFileSync(new URL('../src/tools/googleTools.ts',import.meta.url),'utf8');
const agent=readFileSync(new URL('../src/agent.ts',import.meta.url),'utf8');
const session=readFileSync(new URL('../src/session.ts',import.meta.url),'utf8');

test('operational reconciliation covers Excel, visits and accompaniments',()=>{
 assert.match(source,/importCrmExcel\(env,'automatic-excel-sync'\)/);
 assert.match(source,/calendarList\(env,from,to,1000,cals\.planning\.id\)/);
 assert.match(source,/calendarList\(env,from,to,1000,cals\.accompaniments\.id\)/);
 assert.match(source,/syncCrmExcel\(env\)/);
 assert.match(source,/last_operational_sync/);
 assert.match(source,/effectiveByDate\.get\(date\)/);
 assert.match(source,/isEffectiveVisit\(data\.Efectiva\)/);
 assert.doesNotMatch(source,/!\/\^\(visita\|farmacia\)\\b\/i\.test\(event\.summary\)/);
});

test('Telegram accepts screenshots sent as photos or image documents',()=>{
 const media=readFileSync(new URL('../src/media.ts',import.meta.url),'utf8');
 assert.match(media,/avif\|bmp\|gif\|heic\|heif\|jpe\?g\|png\|svg\|tiff\?\|webp/);
 assert.match(session,/isImageAttachment\(d\.mime_type, name\)/);
 assert.match(session,/analyzeImage\(this\.env/);
 assert.match(session,/lastImage/);
 assert.match(session,/Análisis visual y texto/);
 assert.match(session,/redacte, resuma o responda usando su contenido/);
});

test('Ara runs reconciliation every 30 minutes even without a Telegram heartbeat',()=>{
 assert.match(config,/"ara"[\s\S]*?"triggers": \{ "crons": \["\*\/30 \* \* \* \*"\] \}/);
 assert.match(worker,/const jobs:Promise<unknown>\[\]=\[syncOperationalData\(env\)/);
 assert.doesNotMatch(worker,/if \(!owner\) return;/);
});

test('Arabot knows it can update the original XLSX and exposes a direct command',()=>{
 assert.match(googleTools,/name: 'crm_synchronize'/);
 assert.match(googleTools,/No convierte a Google Sheets ni genera CSV/);
 assert.match(agent,/Nunca propongas convertirlo a Google Sheets ni preparar CSV/);
 assert.match(session,/case '\/sincronizar'/);
 assert.match(session,/calendar_delete\|pharmacy_visit_create/);
});
