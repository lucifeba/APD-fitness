import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/google.ts', import.meta.url), 'utf8');
const js = ts
  .transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } })
  .outputText.replace(/^import .*;$/gm, '')
  .replace(/export /g, '');
const base64UrlEncode = (value) => Buffer.from(value, 'utf8').toString('base64url');
const { buildRaw } = new Function('base64UrlEncode', `${js};return {buildRaw}`)(base64UrlEncode);

test('Gmail draft MIME preserves the required header/body separator and UTF-8 body', () => {
  const expected = 'Hola María,\n\nTe envío la propuesta completa.\n\nUn abrazo,\nAraceli';
  const raw = buildRaw(
    { OWNER_NAME: 'Araceli Delgado', OWNER_EMAIL: 'aradelg@gmail.com' },
    'destino@example.com',
    'Propuesta Aragón',
    expected,
  );
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  const [headers, encodedBody] = mime.split('\r\n\r\n');

  assert.match(headers, /^From: Araceli Delgado <aradelg@gmail.com>/);
  assert.match(headers, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.ok(encodedBody, 'el cuerpo debe quedar separado de las cabeceras');
  assert.equal(Buffer.from(encodedBody, 'base64').toString('utf8'), expected);
});
