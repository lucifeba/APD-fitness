// Relé mínimo: reenvía llamadas al backend de Codex de ChatGPT desde una IP que chatgpt.com acepta.
// Solo acepta peticiones con un token Bearer emitido por auth.openai.com (el del propio usuario).
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const TARGET = 'https://chatgpt.com/backend-api/codex/responses';
const FORWARD = ['authorization', 'chatgpt-account-id', 'content-type', 'accept', 'openai-beta', 'originator', 'user-agent', 'cookie', 'session-id'];

export const maxDuration = 60;

function issuerOf(bearer) {
  try {
    const token = String(bearer || '').replace(/^Bearer\s+/i, '');
    const part = token.split('.')[1] || '';
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).iss || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (issuerOf(req.headers.authorization) !== 'https://auth.openai.com') return res.status(401).json({ error: 'unauthorized' });
  const headers = {};
  for (const h of FORWARD) if (req.headers[h]) headers[h] = req.headers[h];
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  let metadata = {};
  try {
    const parsed = JSON.parse(body);
    metadata = { model: parsed.model, inputItems: Array.isArray(parsed.input) ? parsed.input.length : 0, tools: Array.isArray(parsed.tools) ? parsed.tools.length : 0 };
  } catch {
    metadata = { invalidJson: true };
  }
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('upstream timeout')), 55_000);
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(new Error('client disconnected'));
  });
  try {
    const r = await fetch(TARGET, { method: 'POST', headers, body, signal: controller.signal });
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'text/plain');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-accel-buffering', 'no');
    const setCookie = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
    if (setCookie.length) res.setHeader('x-upstream-set-cookie', JSON.stringify(setCookie));
    console.log(JSON.stringify({ event: 'chatgpt_upstream', status: r.status, msToHeaders: Date.now() - started, ...metadata }));
    if (!r.body) return res.end();
    res.flushHeaders?.();
    await pipeline(Readable.fromWeb(r.body), res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: 'chatgpt_relay_error', ms: Date.now() - started, message, ...metadata }));
    if (!res.headersSent) res.status(504).json({ error: 'upstream_unavailable', detail: message.slice(0, 160) });
    else if (!res.writableEnded) res.end();
  } finally {
    clearTimeout(timeout);
  }
}
