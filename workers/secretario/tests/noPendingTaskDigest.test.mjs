import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const session = readFileSync(new URL('../src/session.ts', import.meta.url), 'utf8');

test('daily brief reports overdue tasks without creating a synthetic Google Task', () => {
  assert.doesNotMatch(session, /pendingTaskDigest|ensurePendingDigestTask/);
  assert.doesNotMatch(session, /Pendientes por completar|He creado en Google Tasks/);
  assert.match(session, /const rendered = renderAgenda\(ag, this\.tz\)/);
  assert.match(session, /Parte de mañana/);
});
