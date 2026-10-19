import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/telegram.ts', import.meta.url), 'utf8');
const writingJs = ts.transpileModule(readFileSync(new URL('../src/writing.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/export /g, '');
const writing = new Function(`${writingJs};return {normalizeWritingText,readableWriting}`)();
const js = ts
  .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(/^import .*;$/gm, '')
  .replace(/export /g, '');
const api = new Function('normalizeWritingText', 'readableWriting', `${js};return {mdToHtml,normalizeTelegramMarkdown}`)(writing.normalizeWritingText, writing.readableWriting);

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

test('el acta pegada por Araceli no muestra escapes, tablas ni entidades y conserva los datos', () => {
  const sample = String.raw`\*\*Acta de la reunión de gerentes Q3\*\*

**Fecha: 1**9 octubre 2026
\---
\### 1. Conclusión ejecutiva
\- **Crecimiento sostenido: +**&#x37;1 % y 4 M €.
\| Tema | Decisión | Responsable | Plazo |
\|------|----------|-------------|------|
\| ReforBit H/M + 50 | Solicitar códigos | Pendiente | 21 oct
\| Formación | Revisar | Pendiente | 25 oct |`;
  const result = api.mdToHtml(sample);
  assert.match(result, /<b>Acta de la reunión de gerentes Q3<\/b>/);
  assert.match(result, /71 % y 4 M €/);
  assert.match(result, /ReforVit H\/M \+ 50/);
  assert.match(result, /Decisión: Solicitar códigos/);
  assert.doesNotMatch(result, /\\|&#|\|---|\| Tema|###|\*\*/);
});
