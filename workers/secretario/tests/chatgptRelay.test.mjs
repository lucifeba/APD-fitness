import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const relay = readFileSync(new URL('../../chatgpt-relay/api/responses.js', import.meta.url), 'utf8');
const workerClient = readFileSync(new URL('../src/chatgpt.ts', import.meta.url), 'utf8');

test('ChatGPT relay streams SSE instead of buffering until Vercel times out', () => {
  assert.match(relay, /pipeline\(Readable\.fromWeb\(r\.body\), res\)/);
  assert.match(relay, /x-accel-buffering/);
  assert.doesNotMatch(relay, /await r\.(?:text|arrayBuffer)\(\)/);
  assert.match(relay, /55_000/);
});

test('Worker abandons a stalled relay early enough to use the next AI provider', () => {
  assert.match(workerClient, /fetchWithTimeout\(target,[\s\S]*30_000\)/);
});
