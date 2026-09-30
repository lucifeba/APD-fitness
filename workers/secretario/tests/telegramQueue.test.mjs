import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/telegramQueue.ts', import.meta.url), 'utf8')
  .replace(/export type[\s\S]*?;\n\n/, '')
  .replace(/export interface[\s\S]*?\n}\n\n/, '')
  .replace(/export /g, '')
  .replace(/: any/g, '')
  .replace(/: string/g, '')
  .replace(/: number/g, '')
  .replace(/: boolean/g, '')
  .replace(/: TelegramJob/g, '')
  .replace(/ as const/g, '');
const module = {};
new Function('module', `${source}\nmodule.exports={telegramJobId,isLongTelegramUpdate,telegramRetryDelayMs,telegramJobDue};`)(module);
const { telegramJobId, isLongTelegramUpdate, telegramRetryDelayMs, telegramJobDue } = module.exports;

test('deduplica reintentos de Telegram por update_id', () => {
  assert.equal(telegramJobId({ update_id: 123, message: { chat: { id: 7 }, message_id: 9 } }), '123');
  assert.equal(telegramJobId({ message: { chat: { id: 7 }, message_id: 9 } }), '7:9');
});

test('detecta trabajos largos que necesitan acuse inmediato', () => {
  assert.equal(isLongTelegramUpdate({ message: { text: 'Analiza la carpeta Q3 de Drive' } }), true);
  assert.equal(isLongTelegramUpdate({ message: { text: 'hola' } }), false);
  assert.equal(isLongTelegramUpdate({ message: { photo: [{ file_id: 'x' }] } }), true);
});

test('aplica backoff acotado y recupera leases vencidos', () => {
  assert.equal(telegramRetryDelayMs(1), 15000);
  assert.equal(telegramRetryDelayMs(3), 60000);
  assert.equal(telegramRetryDelayMs(20), 600000);
  assert.equal(telegramJobDue({ status: 'running', leaseUntil: 99 }, 100), true);
  assert.equal(telegramJobDue({ status: 'pending', nextAttemptAt: 101 }, 100), false);
});
