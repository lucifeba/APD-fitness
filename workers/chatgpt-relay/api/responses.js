// Relé mínimo: reenvía llamadas al backend de Codex de ChatGPT desde una IP que chatgpt.com acepta.
// Solo acepta peticiones con un token Bearer emitido por auth.openai.com (el del propio usuario).
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
  const r = await fetch(TARGET, { method: 'POST', headers, body });
  const text = await r.text();
  res.status(r.status);
  res.setHeader('content-type', r.headers.get('content-type') || 'text/plain');
  const setCookie = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  if (setCookie.length) res.setHeader('x-upstream-set-cookie', JSON.stringify(setCookie));
  res.send(text);
}
