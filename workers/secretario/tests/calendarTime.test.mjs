import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const utilSource = readFileSync(new URL('../src/util.ts', import.meta.url), 'utf8');
const utilJs = ts.transpileModule(utilSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { calendarBoundary, calendarSpan } = await import('data:text/javascript;base64,' + Buffer.from(utilJs).toString('base64'));
const google = readFileSync(new URL('../src/google.ts', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../src/tools/googleTools.ts', import.meta.url), 'utf8');
const session = readFileSync(new URL('../src/session.ts', import.meta.url), 'utf8');

test('normaliza las horas locales de Madrid a RFC3339 aceptado por Google', () => {
  assert.deepEqual(calendarBoundary('2026-10-07T09:30:00', 'Europe/Madrid'), {
    dateTime: '2026-10-07T09:30:00+02:00',
    timeZone: 'Europe/Madrid',
  });
  assert.deepEqual(calendarBoundary('2026-12-07 09:30', 'Europe/Madrid'), {
    dateTime: '2026-12-07T09:30:00+01:00',
    timeZone: 'Europe/Madrid',
  });
  assert.deepEqual(calendarBoundary('2026-10-07', 'Europe/Madrid'), { date: '2026-10-07' });
});

test('rechaza límites imposibles antes de llamar a Google', () => {
  assert.throws(() => calendarBoundary('2026-02-30T09:30:00', 'Europe/Madrid'));
  assert.throws(() => calendarBoundary('hoy a las 09:30', 'Europe/Madrid'));
});

test('convierte un evento de día completo en una visita de una hora aunque solo cambie el inicio', () => {
  const span = calendarSpan(
    '2026-10-07T09:30:00',
    undefined,
    { date: '2026-10-07' },
    { date: '2026-10-08' },
    'Europe/Madrid',
  );
  assert.deepEqual(span.start, { dateTime: '2026-10-07T09:30:00+02:00', timeZone: 'Europe/Madrid' });
  assert.equal(span.end.dateTime, '2026-10-07T08:30:00.000Z');
  assert.equal(Date.parse(span.end.dateTime) - Date.parse(span.start.dateTime), 60 * 60_000);
});

test('calendar_update lee el evento y envía juntos inicio y fin al cambiar su tipo', () => {
  assert.match(google, /const current = await gapi<any>\(env, path\)/);
  assert.match(google, /body\.start = start/);
  assert.match(google, /body\.end = end/);
  assert.match(google, /calendarSpan\(patch\.start, patch\.end/);
});

test('las visitas con hora llegan como eventos con hora y las confirmaciones se agrupan', () => {
  assert.match(tools, /Si el usuario indica una hora, crea un evento con esa hora y duración/);
  assert.match(tools, /time: str\('Hora HH:MM/);
  assert.match(session, /latestBatch/);
  assert.match(session, /friendlyActionError/);
  assert.doesNotMatch(session, /La acción confirmada ha fallado: \$\{clip/);
});
