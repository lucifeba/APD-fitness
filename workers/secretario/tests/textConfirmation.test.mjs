import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const agent = readFileSync(new URL('../src/agent.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/session.ts', import.meta.url), 'utf8');

test('short follow-ups retain tools from recent conversation context', () => {
  assert.match(agent, /const recentToolContext = opts\.history/);
  assert.match(agent, /relevantToolDefs\(allToolDefs, recentToolContext \|\| lastUser\)/);
});

test('Telegram accepts explicit confirmation written as ordinary text', () => {
  assert.match(session, /export function textConfirmationIntent/);
  assert.match(session, /crealo\|creala/);
  assert.match(session, /handleTextConfirmation\(chatId, text, msg\.message_id\)/);
  assert.match(session, /await this\.executePendingAction\(chatId, action\)/);
});

test('ambiguous text confirmation never executes more than one pending action', () => {
  assert.match(session, /if \(actions\.length > 1\)/);
  assert.match(session, /varias acciones pendientes/);
});
