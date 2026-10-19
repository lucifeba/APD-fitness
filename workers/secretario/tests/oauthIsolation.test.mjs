import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/google.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText.replace(/^import .*;$/gm, '').replace(/export /g, '');
const { webOAuthCredentials } = new Function(js + ';return {webOAuthCredentials}')();
const agent = { GOOGLE_CLIENT_ID: 'agent-id', GOOGLE_CLIENT_SECRET: 'agent-secret', GOOGLE_REFRESH_TOKEN: 'existing-refresh' };

test('la preparación de la separación conserva el acceso existente y no toca el refresh token', () => {
  assert.deepEqual(webOAuthCredentials(agent), { clientId: 'agent-id', clientSecret: 'agent-secret', separated: false });
  assert.equal(agent.GOOGLE_REFRESH_TOKEN, 'existing-refresh');
});

test('el dashboard usa el par independiente completo y no cambia la credencial del agente', () => {
  assert.deepEqual(webOAuthCredentials({ ...agent, GOOGLE_WEB_CLIENT_ID: 'web-id', GOOGLE_WEB_CLIENT_SECRET: 'web-secret' }), { clientId: 'web-id', clientSecret: 'web-secret', separated: true });
  assert.equal(agent.GOOGLE_CLIENT_ID, 'agent-id');
});

test('una configuración parcial no mezcla ID y secreto de distintos clientes', () => {
  assert.throws(() => webOAuthCredentials({ ...agent, GOOGLE_WEB_CLIENT_ID: 'web-id' }), /Falta completar/);
  assert.throws(() => webOAuthCredentials({ ...agent, GOOGLE_WEB_CLIENT_SECRET: 'web-secret' }), /Falta completar/);
  assert.throws(() => webOAuthCredentials({ ...agent, GOOGLE_WEB_CLIENT_ID: 'agent-id', GOOGLE_WEB_CLIENT_SECRET: 'web-secret' }), /distinto/);
});
