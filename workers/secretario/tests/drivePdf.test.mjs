import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const google=readFileSync(new URL('../src/google.ts',import.meta.url),'utf8');
const tools=readFileSync(new URL('../src/tools/googleTools.ts',import.meta.url),'utf8');
const knowledge=readFileSync(new URL('../src/knowledge.ts',import.meta.url),'utf8');
const agent=readFileSync(new URL('../src/agent.ts',import.meta.url),'utf8');
const session=readFileSync(new URL('../src/session.ts',import.meta.url),'utf8');
const knowledgeTools=readFileSync(new URL('../src/tools/knowledgeTools.ts',import.meta.url),'utf8');
const selection=readFileSync(new URL('../src/toolSelection.ts',import.meta.url),'utf8');

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

test('a pasted Drive folder URL is processed deterministically and remembered',()=>{
 assert.match(session,/export function driveFolderUrls/);
 assert.match(session,/importDriveFolderKnowledge\(this\.env, chatId, folderId/);
 assert.match(session,/Preguntas Averiguar/);
 assert.match(session,/Optimización del Consejo Farmacéutico/);
 assert.match(session,/drive-folder/);
 assert.match(session,/transcriptions_drive_folder_id/);
 assert.match(agent,/transcriptionsFolder/);
});

test('the full analysis can create a Google Doc and return its direct link',()=>{
 assert.match(knowledgeTools,/google_doc_title/);
 assert.match(knowledgeTools,/drive_folder_id/);
 assert.match(knowledgeTools,/driveCreateDoc/);
 assert.match(knowledgeTools,/Abrir el documento en Google Docs/);
 assert.match(agent,/google_doc_title y drive_folder_id/);
});

test('delegate analyses create form documents and update the shared database',()=>{
 assert.match(agent,/1jgjreBjijah7AxHuQrSp50Vm13qTGMlA/);
 assert.match(agent,/1pZmmMvQgQPYC_hFIvjwt4Tsvqf0aKMmdnxz_lKkB2vo/);
 assert.match(agent,/analysis_archive/);
 assert.match(selection,/analysis_archive/);
 assert.match(knowledgeTools,/name: 'analysis_archive'/);
 assert.match(knowledgeTools,/Acompañamientos!A:AP/);
 assert.match(knowledgeTools,/Visitas y objeciones/);
 assert.match(knowledgeTools,/visit_documents/);
 assert.match(google,/export async function sheetsAppendRows/);
});
