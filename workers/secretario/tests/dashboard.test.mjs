import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/dashboard.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'');
const {page,appShell}=new Function(js+';return {page,appShell}')();
test('programming controls only appear for administrator',()=>{
 assert.ok(appShell('info@apdsport.com').includes('id="programming"'));
 assert.ok(!appShell('aradelg@gmail.com').includes('id="programming"'));
});
test('generated browser JavaScript parses',async()=>{
 const html=await page({BRAND_NAME:'Nuvia'},appShell('info@apdsport.com')).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 assert.doesNotThrow(()=>new Script(script));
 assert.ok(html.includes('Borrador de correo'));
});
