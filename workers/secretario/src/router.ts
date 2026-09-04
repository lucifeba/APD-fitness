import type { ChatMessage, ChatResult, Env, ToolCall, ToolDef } from './env';
import { neuronsToday, recordUsage } from './db';
import { callChatGPT, chatgptConnected } from './chatgpt';
import { vaultGet } from './tools/autonomyTools';

let neuronCache: { day: string; value: number; at: number } | null = null;

async function neuronsUsed(env: Env): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  if (neuronCache && neuronCache.day === day && Date.now() - neuronCache.at < 120_000) return neuronCache.value;
  const value = await neuronsToday(env);
  neuronCache = { day, value, at: Date.now() };
  return value;
}

function bumpNeurons(n: number): void {
  if (neuronCache) neuronCache.value += n;
}
import { uid } from './util';

export type Tier = 'smart' | 'fast';

interface Target {
  provider: 'cf' | 'gemini' | 'groq' | 'openrouter' | 'openai' | 'chatgpt';
  model: string;
}

/** Sesión de ChatGPT (OAuth) conectada desde el panel; cache de 2 min. */
let chatgptOk: { at: number; value: boolean } | null = null;
async function resolveChatGPT(env: Env): Promise<boolean> {
  if (chatgptOk && Date.now() - chatgptOk.at < 120_000) return chatgptOk.value;
  const value = Boolean(await chatgptConnected(env).catch(() => null));
  chatgptOk = { at: Date.now(), value };
  return value;
}
export function forgetChatGPTCache(): void {
  chatgptOk = null;
}

/** Clave de OpenAI: secreto del Worker o, si no, la que el usuario conectó desde el panel (baúl cifrado). Cache de 2 min. */
let openaiKeyCache: { value: string; at: number } | null = null;
export async function resolveOpenAIKey(env: Env, force = false): Promise<string> {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  if (!force && openaiKeyCache && Date.now() - openaiKeyCache.at < 120_000) return openaiKeyCache.value;
  const value = (await vaultGet(env, 'OPENAI_API_KEY').catch(() => null)) || '';
  openaiKeyCache = { value, at: Date.now() };
  return value;
}
export function forgetOpenAIKeyCache(): void {
  openaiKeyCache = null;
}

/** Neuronas por millón de tokens (entrada, salida). Para modelos con precio en dólares: $ por M / 0.011 * 1000. */
const NEURON_RATES: Record<string, [number, number]> = {
  '@cf/openai/gpt-oss-120b': [31818, 68182],
  '@cf/openai/gpt-oss-20b': [18182, 27273],
  '@cf/meta/llama-4-scout-17b-16e-instruct': [24545, 77273],
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': [26668, 204805],
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': [4119, 34868],
  '@cf/meta/llama-3.2-11b-vision-instruct': [4410, 61493],
  '@cf/qwen/qwen3-30b-a3b-fp8': [4545, 27273],
  '@cf/mistralai/mistral-small-3.1-24b-instruct': [31876, 50488],
  '@cf/baai/bge-m3': [1075, 0],
};
const DEFAULT_RATE: [number, number] = [30000, 80000];

export function estimateNeurons(model: string, input: number, output: number): number {
  const [i, o] = NEURON_RATES[model] ?? DEFAULT_RATE;
  return (input * i + output * o) / 1_000_000;
}

function parseChain(spec: string | undefined, fallback: string): Target[] {
  return (spec || fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const idx = s.indexOf(':');
      return { provider: s.slice(0, idx) as Target['provider'], model: s.slice(idx + 1) };
    });
}

function available(env: Env, t: Target): boolean {
  if (t.provider === 'cf') return Boolean(env.AI);
  if (t.provider === 'gemini') return Boolean(env.GEMINI_API_KEY);
  if (t.provider === 'groq') return Boolean(env.GROQ_API_KEY);
  if (t.provider === 'openrouter') return Boolean(env.OPENROUTER_API_KEY);
  if (t.provider === 'openai') return Boolean(env.OPENAI_API_KEY || openaiKeyCache?.value);
  if (t.provider === 'chatgpt') return Boolean(chatgptOk?.value);
  return false;
}

function baseUrl(p: Target['provider']): string {
  if (p === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai';
  if (p === 'groq') return 'https://api.groq.com/openai/v1';
  if (p === 'openai') return 'https://api.openai.com/v1';
  return 'https://openrouter.ai/api/v1';
}

function apiKey(env: Env, p: Target['provider']): string {
  if (p === 'gemini') return env.GEMINI_API_KEY || '';
  if (p === 'groq') return env.GROQ_API_KEY || '';
  if (p === 'openai') return env.OPENAI_API_KEY || openaiKeyCache?.value || '';
  return env.OPENROUTER_API_KEY || '';
}

function parseArgs(a: unknown): Record<string, unknown> {
  if (a && typeof a === 'object') return a as Record<string, unknown>;
  if (typeof a === 'string') {
    try {
      return JSON.parse(a);
    } catch {
      return { input: a };
    }
  }
  return {};
}

/** Convierte una lista de argumentos estilo Python (a="x", b=2, c=true) en objeto. */
function parsePythonArgs(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]]*\]|\{[^}]*\}|[^,()]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const key = m[1];
    const raw = m[2].trim();
    let val: unknown = raw;
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) val = raw.slice(1, -1).replace(/\\(["'])/g, '$1');
    else if (raw === 'True' || raw === 'true') val = true;
    else if (raw === 'False' || raw === 'false') val = false;
    else if (raw === 'None' || raw === 'null') val = null;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) val = Number(raw);
    else if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        val = JSON.parse(raw.replace(/'/g, '"'));
      } catch {
        val = raw;
      }
    }
    out[key] = val;
  }
  return out;
}

/**
 * Respaldo: algunos modelos (Llama 4, Qwen) escriben las llamadas como texto en vez de usar el formato
 * estructurado: `[get_time(), calendar_list(from="...", to="...")]` o `[llamada a get_time: {}]`.
 * Solo se aceptan nombres de herramientas conocidas para no ejecutar nada inventado.
 */
export function parseTextToolCalls(content: string, tools: ToolDef[]): ToolCall[] {
  if (!content || !tools.length) return [];
  const known = new Set(tools.map((t) => t.name));
  const calls: ToolCall[] = [];
  const text = content.trim();

  // Formato "[llamada a nombre: {json}]" (el que usamos al serializar el historial para Workers AI).
  const reLlamada = /\[llamada a (\w+):\s*(\{[\s\S]*?\})\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = reLlamada.exec(text))) {
    if (!known.has(m[1])) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(m[2]);
    } catch {
      /* argumentos ilegibles: se llama sin ellos */
    }
    calls.push({ id: uid('call_'), name: m[1], arguments: args });
  }
  if (calls.length) return calls;

  // Formato pythónico: toda la respuesta es una lista de llamadas.
  if (!/^\[?\s*\w+\s*\(/.test(text)) return [];
  const rePy = /(\w+)\s*\(((?:[^()"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)\)/g;
  while ((m = rePy.exec(text))) {
    if (!known.has(m[1])) continue;
    calls.push({ id: uid('call_'), name: m[1], arguments: parsePythonArgs(m[2]) });
  }
  // Si además del bloque de llamadas hay prosa larga, no es una llamada sino una explicación.
  const stripped = text.replace(rePy, '').replace(/[\[\],\s]/g, '');
  if (stripped.length > 40) return [];
  return calls;
}

/** Mensajes en formato Workers AI: las llamadas a herramientas del asistente se serializan en texto. */
function toWorkersAI(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content:
          (m.content ? `${m.content}\n` : '') +
          m.tool_calls.map((c) => `[llamada a ${c.name}: ${JSON.stringify(c.arguments)}]`).join('\n'),
      };
    }
    if (m.role === 'tool') return { role: 'tool', name: m.name ?? 'tool', tool_call_id: m.tool_call_id ?? m.name, content: m.content };
    return { role: m.role, content: m.content };
  });
}

function toOpenAI(messages: ChatMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })),
      };
    }
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id ?? m.name, content: m.content };
    return { role: m.role, content: m.content };
  });
}

async function callWorkersAI(env: Env, model: string, messages: ChatMessage[], tools: ToolDef[], maxTokens: number): Promise<ChatResult> {
  const body: any = { messages: toWorkersAI(messages), max_tokens: maxTokens, temperature: 0.3 };
  if (tools.length) body.tools = tools.map((t) => ({ type: 'function', function: t }));
  const r: any = await (env.AI as any).run(model, body);
  const raw: any[] = Array.isArray(r?.tool_calls) ? r.tool_calls : Array.isArray(r?.choices?.[0]?.message?.tool_calls) ? r.choices[0].message.tool_calls : [];
  const toolCalls: ToolCall[] = raw
    .map((c) => ({
      id: c.id || uid('call_'),
      name: c.function?.name ?? c.name,
      arguments: parseArgs(c.function?.arguments ?? c.arguments),
    }))
    .filter((c) => c.name);
  let content = '';
  if (typeof r?.response === 'string') content = r.response;
  else if (Array.isArray(r?.output)) {
    // Formato "responses" (gpt-oss): texto final y llamadas a función como items de salida.
    for (const item of r.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) content += item.content.map((c: any) => c?.text ?? '').join('');
      else if (item?.type === 'function_call' && item.name) toolCalls.push({ id: item.call_id || item.id || uid('call_'), name: item.name, arguments: parseArgs(item.arguments) });
    }
  } else if (r?.choices?.[0]?.message?.content) content = String(r.choices[0].message.content);
  content = content.trim();
  if (!toolCalls.length) {
    const fromText = parseTextToolCalls(content, tools);
    if (fromText.length) {
      toolCalls.push(...fromText);
      content = '';
    }
  }
  const usage = { input: Number(r?.usage?.prompt_tokens ?? r?.usage?.input_tokens ?? 0), output: Number(r?.usage?.completion_tokens ?? r?.usage?.output_tokens ?? 0) };
  return { content, toolCalls, provider: 'cf', model, usage };
}

async function callOpenAICompatible(
  env: Env,
  t: Target,
  messages: ChatMessage[],
  tools: ToolDef[],
  maxTokens: number,
): Promise<ChatResult> {
  const body: any = { model: t.model, messages: toOpenAI(messages) };
  // Los modelos de razonamiento de OpenAI (gpt-5, o-series) rechazan max_tokens y temperature.
  if (t.provider === 'openai') body.max_completion_tokens = maxTokens;
  else {
    body.max_tokens = maxTokens;
    body.temperature = 0.3;
  }
  if (tools.length) {
    body.tools = tools.map((tl) => ({ type: 'function', function: tl }));
    body.tool_choice = 'auto';
  }
  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${apiKey(env, t.provider)}` };
  if (t.provider === 'openrouter') headers['X-Title'] = 'Secretario';
  const r = await fetch(`${baseUrl(t.provider)}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${t.provider} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json<any>();
  const msg = j.choices?.[0]?.message ?? {};
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any) => ({
    id: c.id || uid('call_'),
    name: c.function?.name,
    arguments: parseArgs(c.function?.arguments),
  }));
  let content = String(msg.content ?? '').trim();
  if (!toolCalls.length) {
    const fromText = parseTextToolCalls(content, tools);
    if (fromText.length) {
      toolCalls.push(...fromText);
      content = '';
    }
  }
  return {
    content,
    toolCalls,
    provider: t.provider,
    model: t.model,
    usage: { input: Number(j.usage?.prompt_tokens ?? 0), output: Number(j.usage?.completion_tokens ?? 0) },
  };
}

const roughTokens = (messages: ChatMessage[]) => Math.ceil(messages.reduce((n, m) => n + (m.content?.length ?? 0), 0) / 3.5);

/**
 * Elige el primer cerebro disponible de la cadena y salta al siguiente si falla o si Workers AI
 * está cerca del presupuesto diario de neuronas. Devuelve siempre un resultado o lanza el último error.
 */
export async function chat(env: Env, tier: Tier, messages: ChatMessage[], tools: ToolDef[] = [], maxTokens = 1500, only?: string): Promise<ChatResult> {
  await Promise.all([resolveOpenAIKey(env), resolveChatGPT(env)]);
  const chain = parseChain(
    tier === 'smart' ? env.MODEL_CHAIN_SMART : env.MODEL_CHAIN_FAST,
    tier === 'smart' ? 'cf:@cf/openai/gpt-oss-120b,cf:@cf/meta/llama-3.3-70b-instruct-fp8-fast' : 'cf:@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  )
    .filter((t) => available(env, t))
    // Diagnóstico: limitar a un proveedor/modelo concreto ("cf", "gemini" o "cf:@cf/openai/gpt-oss-120b").
    .filter((t) => !only || t.provider === only || `${t.provider}:${t.model}` === only);
  if (!chain.length) throw new Error('No hay ningún proveedor de IA configurado.');
  const budget = Number(env.DAILY_NEURON_BUDGET || 9000);
  const used = await neuronsUsed(env);
  const est = roughTokens(messages);
  const errors: string[] = [];
  const ordered = [...chain];
  // Si Workers AI está cerca del límite, lo dejamos al final como último recurso.
  const cfOverBudget = (t: Target) => t.provider === 'cf' && used + estimateNeurons(t.model, est, 600) > budget;
  ordered.sort((a, b) => Number(cfOverBudget(a)) - Number(cfOverBudget(b)));
  for (const t of ordered) {
    try {
      const res =
        t.provider === 'cf'
          ? await callWorkersAI(env, t.model, messages, tools, maxTokens)
          : t.provider === 'chatgpt'
            ? await callChatGPT(env, t.model, messages, tools, maxTokens)
            : await callOpenAICompatible(env, t, messages, tools, maxTokens);
      const inTok = res.usage.input || est;
      const outTok = res.usage.output || Math.ceil((res.content.length + JSON.stringify(res.toolCalls).length) / 3.5);
      const neurons = t.provider === 'cf' ? estimateNeurons(t.model, inTok, outTok) : 0;
      bumpNeurons(neurons);
      await recordUsage(env, t.provider, t.model, inTok, outTok, neurons);
      if (!res.content && !res.toolCalls.length) throw new Error('respuesta vacía');
      return res;
    } catch (e: any) {
      const msg = `${t.provider}/${t.model}: ${String(e?.message ?? e).slice(0, 400)}`;
      console.warn('cerebro falló', msg);
      errors.push(msg);
      await recordUsage(env, t.provider, t.model, 0, 0, 0, true).catch(() => undefined);
    }
  }
  throw new Error(`Todos los cerebros fallaron:\n${errors.join('\n')}`);
}

/** Diagnóstico: lista los modelos que ofrece un proveedor externo. */
export async function listModels(env: Env, provider: 'gemini' | 'groq' | 'openrouter' | 'openai'): Promise<string[]> {
  await resolveOpenAIKey(env);
  const r = await fetch(`${baseUrl(provider)}/models`, { headers: { authorization: `Bearer ${apiKey(env, provider)}` } });
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json<any>();
  return (j.data ?? []).map((m: any) => String(m.id)).sort();
}

/** Diagnóstico: prueba cada cerebro de la cadena con una petición mínima que exige una llamada a herramienta. */
export async function probeProviders(env: Env, tier: Tier = 'smart', chainSpec?: string): Promise<{ provider: string; model: string; ok: boolean; ms: number; toolCalls?: string[]; content?: string; error?: string }[]> {
  await Promise.all([resolveOpenAIKey(env), resolveChatGPT(env)]);
  const chain = parseChain(chainSpec || (tier === 'smart' ? env.MODEL_CHAIN_SMART : env.MODEL_CHAIN_FAST), '');
  const tools: ToolDef[] = [
    { name: 'get_time', description: 'Devuelve la hora actual.', parameters: { type: 'object', properties: {}, required: [] } },
  ];
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Eres un asistente. Cuando te pregunten la hora, usa la herramienta get_time.' },
    { role: 'user', content: '¿Qué hora es?' },
  ];
  const out = [];
  for (const t of chain) {
    const t0 = Date.now();
    if (!available(env, t)) {
      out.push({ provider: t.provider, model: t.model, ok: false, ms: 0, error: 'sin clave configurada' });
      continue;
    }
    try {
      const res =
        t.provider === 'cf' ? await callWorkersAI(env, t.model, messages, tools, 200) : t.provider === 'chatgpt' ? await callChatGPT(env, t.model, messages, tools, 200) : await callOpenAICompatible(env, t, messages, tools, 200);
      out.push({ provider: t.provider, model: t.model, ok: true, ms: Date.now() - t0, toolCalls: res.toolCalls.map((c) => c.name), content: res.content.slice(0, 200) });
    } catch (e: any) {
      out.push({ provider: t.provider, model: t.model, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 400) });
    }
  }
  return out;
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const model = env.MODEL_EMBED || '@cf/baai/bge-m3';
  const r: any = await (env.AI as any).run(model, { text: texts });
  const tokens = Math.ceil(texts.join(' ').length / 3.5);
  await recordUsage(env, 'cf', model, tokens, 0, estimateNeurons(model, tokens, 0)).catch(() => undefined);
  return r.data as number[][];
}

/** Petición corta sin herramientas. */
export async function ask(env: Env, tier: Tier, system: string, user: string, maxTokens = 800): Promise<string> {
  const r = await chat(
    env,
    tier,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    [],
    maxTokens,
  );
  return r.content;
}
