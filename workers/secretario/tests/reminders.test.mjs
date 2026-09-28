import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/reminders.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
 .replace(/^import .*;$/gm,'')
 .replace(/export /g,'');
const {taskTime,remindMinutes}=new Function(compiled+';return {taskTime,remindMinutes}')();

test('timed Google Tasks are recognised for a fifteen-minute Telegram reminder',()=>{
 assert.equal(remindMinutes({}),15);
 assert.equal(taskTime({notes:'Hora: 17:00'}),'17:00');
 assert.equal(taskTime({notes:'Llamar a las 9:05 y preparar documentación'}),'09:05');
 assert.equal(taskTime({notes:'Sin hora concreta'}),null);
});

test('the reminder lead time remains configurable without accepting invalid values',()=>{
 assert.equal(remindMinutes({REMIND_MINUTES:'20'}),20);
 assert.equal(remindMinutes({REMIND_MINUTES:'invalid'}),15);
});
