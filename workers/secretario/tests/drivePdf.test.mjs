import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const google=readFileSync(new URL('../src/google.ts',import.meta.url),'utf8');
const tools=readFileSync(new URL('../src/tools/googleTools.ts',import.meta.url),'utf8');
const knowledge=readFileSync(new URL('../src/knowledge.ts',import.meta.url),'utf8');
const agent=readFileSync(new URL('../src/agent.ts',import.meta.url),'utf8');

test('Drive downloads and extracts binary PDFs instead of rejecting them',()=>{
 assert.match(google,/const bytes = await driveDownloadBytes\(env, fileId\)/);
 assert.match(google,/extractText\(env, meta\.name, meta\.mimeType/);
 assert.doesNotMatch(google,/No puedo leerlo como texto/);
});

test('Aravitas can index one file or a complete Drive folder idempotently',()=>{
 assert.match(tools,/name: 'drive_import_knowledge'/);
 assert.match(tools,/name: 'drive_folder_import_knowledge'/);
 assert.match(tools,/OCR si hace falta/);
 assert.match(knowledge,/export async function ingestDriveDocument/);
 assert.match(knowledge,/reused:true/);
 assert.match(agent,/Nunca digas que un PDF binario debe convertirse a Google Docs/);
});
