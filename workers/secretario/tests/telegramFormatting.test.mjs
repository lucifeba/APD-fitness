import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/telegram.ts', import.meta.url), 'utf8');
const js = ts
  .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(/^import .*;$/gm, '')
  .replace(/export /g, '');
const api = new Function(`${js};return {mdToHtml,normalizeTelegramMarkdown}`)();

test('las fórmulas del modelo llegan como castellano normal', () => {
  const result = api.mdToHtml('$$\\text{Necesidad detectada} + \\text{Herramienta comercial} = \\mathbf{Propuesta Comercial}$$');
  assert.match(result, /Necesidad detectada más Herramienta comercial da como resultado Propuesta Comercial/);
  assert.doesNotMatch(result, /\$|\\text|\\mathbf|\{|\}/);
});

test('las tablas se convierten en apartados legibles, no en código', () => {
  const result = api.mdToHtml('| Necesidad | Herramienta | Propuesta |\n|---|---|---|\n| Mejorar margen | Vademécum\\<br>Transfer | Acuerdo |');
  assert.match(result, /1\. Necesidad: Mejorar margen/);
  assert.match(result, /Herramienta: Vademécum/);
  assert.doesNotMatch(result, /<pre>|```|&lt;br&gt;|─/);
});

test('elimina separadores y escapes que se mostrarían literalmente', () => {
  const result = api.normalizeTelegramMarkdown('\\---\n\\*Texto\\*\\<br>Segunda línea');
  assert.equal(result, '*Texto*\nSegunda línea');
});
