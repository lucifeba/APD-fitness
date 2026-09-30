import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/configKnowledge.ts', import.meta.url), 'utf8');
const js = ts
  .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(/^import .*;$/gm, '')
  .replace(/export /g, '');
const api = new Function(`${js};return {isConfigurationInstruction,containsSensitiveConfiguration,mergeConfigurationKnowledge}`)();

test('detecta instrucciones permanentes sin capturar peticiones operativas', () => {
  assert.equal(api.isConfigurationInstruction('A partir de ahora guarda siempre las configuraciones que te indique por Telegram.'), true);
  assert.equal(api.isConfigurationInstruction('Quiero que cuando te pida algo de configuración vía Telegram, lo metas en tu conocimiento.'), true);
  assert.equal(api.isConfigurationInstruction('Configura el cuadro de mando para mostrar siempre los importes netos.'), true);
  assert.equal(api.isConfigurationInstruction('Crea una visita mañana a las 10.'), false);
  assert.equal(api.isConfigurationInstruction('Redacta un correo a Marta.'), false);
});

test('deduplica reglas y rechaza secretos', () => {
  const first = api.mergeConfigurationKnowledge([], 'Usa siempre español', '2026-09-30T08:00:00Z');
  const second = api.mergeConfigurationKnowledge(first, 'Usa siempre español', '2026-09-30T09:00:00Z');
  assert.equal(second.length, 1);
  assert.equal(second[0].savedAt, '2026-09-30T09:00:00Z');
  assert.equal(api.containsSensitiveConfiguration('API key: sk-12345678901234567890'), true);
});
