import { clip, htmlToText } from '../util';
import { params, str, num, type ToolSpec } from './types';

interface Hit {
  title: string;
  url: string;
  snippet: string;
}

async function tavily(key: string, q: string, n: number): Promise<Hit[]> {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: key, query: q, max_results: n, include_answer: false }),
  });
  if (!r.ok) throw new Error(`Tavily ${r.status}`);
  const j = await r.json<any>();
  return (j.results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: x.content ?? '' }));
}

async function brave(key: string, q: string, n: number): Promise<Hit[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`, {
    headers: { accept: 'application/json', 'X-Subscription-Token': key },
  });
  if (!r.ok) throw new Error(`Brave ${r.status}`);
  const j = await r.json<any>();
  return (j.web?.results ?? []).map((x: any) => ({ title: x.title, url: x.url, snippet: x.description ?? '' }));
}

async function duckduckgo(q: string, n: number): Promise<Hit[]> {
  const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Secretario/1.0', accept: 'text/html' },
  });
  if (!r.ok) throw new Error(`DuckDuckGo ${r.status}`);
  const html = await r.text();
  const out: Hit[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < n) {
    let url = m[1];
    const u = url.match(/uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    out.push({ title: htmlToText(m[2]), url, snippet: htmlToText(m[3] ?? '') });
  }
  return out;
}

export async function webSearch(env: { TAVILY_API_KEY?: string; BRAVE_API_KEY?: string }, q: string, n = 6): Promise<Hit[]> {
  const errors: string[] = [];
  if (env.TAVILY_API_KEY)
    try {
      return await tavily(env.TAVILY_API_KEY, q, n);
    } catch (e: any) {
      errors.push(e.message);
    }
  if (env.BRAVE_API_KEY)
    try {
      return await brave(env.BRAVE_API_KEY, q, n);
    } catch (e: any) {
      errors.push(e.message);
    }
  try {
    return await duckduckgo(q, n);
  } catch (e: any) {
    errors.push(e.message);
  }
  throw new Error(`Búsqueda no disponible: ${errors.join('; ')}`);
}

export async function fetchUrl(url: string, maxChars = 12000): Promise<string> {
  const direct = async () => {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Secretario/1.0', accept: 'text/html,application/json,text/plain,*/*' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    if (ct.includes('html')) {
      const main = body.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? body;
      const text = htmlToText(main);
      if (text.length < 200) throw new Error('página casi vacía (posible JS o bloqueo)');
      return text;
    }
    return body;
  };
  try {
    return clip(await direct(), maxChars);
  } catch (e: any) {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers: { accept: 'text/plain', 'user-agent': 'Secretario/1.0' } });
    if (!r.ok) throw new Error(`No pude leer ${url}: ${e.message}; lector alternativo ${r.status}`);
    return clip(await r.text(), maxChars);
  }
}

export const webTools: ToolSpec[] = [
  {
    def: {
      name: 'web_search',
      description: 'Busca en internet. Úsala para información actual, datos que no conoces o para verificar. Devuelve título, url y resumen.',
      parameters: params({ query: str('Consulta de búsqueda, concreta y en el idioma del contenido buscado.'), max_results: num('Número de resultados, 3 a 10.') }, ['query']),
    },
    run: async (a, ctx) => webSearch(ctx.env, String(a.query), Math.min(10, Math.max(3, Number(a.max_results) || 6))),
  },
  {
    def: {
      name: 'fetch_url',
      description: 'Lee el contenido de una página web o documento público y lo devuelve como texto.',
      parameters: params({ url: str('URL completa con https://'), max_chars: num('Máximo de caracteres a devolver (por defecto 12000).') }, ['url']),
    },
    run: async (a) => fetchUrl(String(a.url), Math.min(40000, Number(a.max_chars) || 12000)),
  },
];
