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
const writingJs = ts.transpileModule(readFileSync(new URL('../src/writing.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText.replace(/export /g, '');
const { renderWriting, assertSummaryDraft, isSummaryRequest, summaryOutputIssue } = new Function(`${writingJs};return {renderWriting,assertSummaryDraft,isSummaryRequest,summaryOutputIssue}`)();
const { buildRaw, gmailDraft } = new Function('base64UrlEncode', 'renderWriting', 'assertSummaryDraft', `${js};return {buildRaw,gmailDraft}`)(base64UrlEncode, renderWriting, assertSummaryDraft);

function partsOf(raw) {
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  const boundary = mime.match(/boundary="([^"]+)"/)[1];
  return mime.split('--' + boundary).slice(1, -1).map(part => {
    const [headers, ...body] = part.trim().split('\r\n\r\n');
    return { headers, content: Buffer.from(body.join('\r\n\r\n'), 'base64').toString('utf8') };
  });
}

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
  assert.match(headers, /Content-Type: multipart\/alternative/);
  assert.ok(encodedBody, 'el cuerpo debe quedar separado de las cabeceras');
  const parts = partsOf(raw);
  assert.equal(parts[0].content, expected);
  assert.match(parts[0].headers, /text\/plain; charset="UTF-8"/);
  assert.match(parts[1].content, /Hola María/);
});

test('el borrador guarda negritas y cursivas reales y una alternativa de texto limpia', () => {
  const raw = buildRaw({ OWNER_EMAIL: 'aradelg@gmail.com' }, '', 'Acta ReforBit', String.raw`\*\*Conclusión ejecutiva\*\*

ReforBit crece +&#x37;1 %. *Pendiente de validar*.
\---`);
  const [plain, html] = partsOf(raw);
  assert.equal(plain.content, 'Conclusión ejecutiva\n\nReforVit crece +71 %. Pendiente de validar.');
  assert.match(html.content, /<strong>Conclusión ejecutiva<\/strong>/);
  assert.match(html.content, /<em>Pendiente de validar<\/em>/);
  assert.doesNotMatch(plain.content + html.content, /\\|&#|ReforBit|\*\*/);
});

test('el formato de correo escapa HTML arbitrario y no pierde euros ni acentos', () => {
  const formatted = renderWriting('<script>alert(1)</script>\n\nMálaga: 4 M € y +71 %.');
  assert.doesNotMatch(formatted.html, /<script>/);
  assert.match(formatted.html, /&lt;script&gt;/);
  assert.match(formatted.text, /Málaga: 4 M € y \+71 %/);
});

test('reconoce actas y resúmenes sin confundir una petición explícita de transcripción literal', () => {
  assert.equal(isSummaryRequest('Acta Call 19 octubre'), true);
  assert.equal(isSummaryRequest('Haz un resumen para un mail'), true);
  assert.equal(isSummaryRequest('Correo con la transcripción literal'), false);
  assert.equal(summaryOutputIssue('Temas tratados\nSe practicará el silencio en cinco visitas.'), null);
});

test('bloquea el borrador defectuoso antes de acceder a Gmail', async () => {
  await assert.rejects(gmailDraft({}, '', 'Acta Call 19 octubre', 'Asistentes\n- Orador A\n- Orador B (Carlos, Patricia)'), /Borrador no guardado/);
  assert.throws(() => assertSummaryDraft('Resumen reunión', '00:03:25 Intervención del equipo'), /marcas de tiempo/);
  assert.doesNotThrow(() => assertSummaryDraft('Resumen call', 'Esta semana cada delegado practicará en cinco visitas, dejando tres o cuatro segundos tras la pregunta.'));
});
