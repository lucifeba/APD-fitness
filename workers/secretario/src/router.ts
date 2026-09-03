import type { ChatMessage, ChatResult, Env, ToolCall, ToolDef } from './env';
import { neuronsToday, recordUsage } from './db';

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
  provider: 'cf' | 'gemini' | 'groq' | 'openrouter';
  model: string;
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
  return false;
}

function baseUrl(p: Target['provider']): string {
  if (p === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai';
  if (p === 'groq') return 'https://api.groq.com/openai/v1';
  return 'https://openrouter.ai/api/v1';
}

function apiKey(env: Env, p: Target['provider']): string {
  if (p === 'gemini') return env.GEMINI_API_KEY || '';
  if (p === 'groq') return env.GROQ_API_KEY || '';
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
  const raw: any[] = Array.isArray(r?.tool_calls) ? r.tool_calls : [];
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
    // Formato "responses" (gpt-oss): buscamos el texto final.
    for (const item of r.output) {
      if (item?.type === 'message' && Array.isArray(item.content))
        content += item.content.map((c: any) => c?.text ?? '').join('');
    }
  } else if (r?.choices?.[0]?.message?.content) content = String(r.choices[0].message.content);
  const usage = { input: Number(r?.usage?.prompt_tokens ?? 0), output: Number(r?.usage?.completion_tokens ?? 0) };
  return { content: content.trim(), toolCalls, provider: 'cf', model, usage };
}

async function callOpenAICompatible(
  env: Env,
  t: Target,
  messages: ChatMessage[],
  tools: ToolDef[],
  maxTokens: number,
): Promise<ChatResult> {
  const body: any = { model: t.model, messages: toOpenAI(messages), max_tokens: maxTokens, temperature: 0.3 };
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
  return {
    content: String(msg.content ?? '').trim(),
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
export async function chat(env: Env, tier: Tier, messages: ChatMessage[], tools: ToolDef[] = [], maxTokens = 1500): Promise<ChatResult> {
  const chain = parseChain(
    tier === 'smart' ? env.MODEL_CHAIN_SMART : env.MODEL_CHAIN_FAST,
    tier === 'smart' ? 'cf:@cf/openai/gpt-oss-120b,cf:@cf/meta/llama-3.3-70b-instruct-fp8-fast' : 'cf:@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  ).filter((t) => available(env, t));
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
      const res = t.provider === 'cf' ? await callWorkersAI(env, t.model, messages, tools, maxTokens) : await callOpenAICompatible(env, t, messages, tools, maxTokens);
      const inTok = res.usage.input || est;
      const outTok = res.usage.output || Math.ceil((res.content.length + JSON.stringify(res.toolCalls).length) / 3.5);
      const neurons = t.provider === 'cf' ? estimateNeurons(t.model, inTok, outTok) : 0;
      bumpNeurons(neurons);
      await recordUsage(env, t.provider, t.model, inTok, outTok, neurons);
      if (!res.content && !res.toolCalls.length) throw new Error('respuesta vacía');
      return res;
    } catch (e: any) {
      errors.push(`${t.provider}/${t.model}: ${e?.message ?? e}`);
      await recordUsage(env, t.provider, t.model, 0, 0, 0, true).catch(() => undefined);
    }
  }
  throw new Error(`Todos los cerebros fallaron:\n${errors.join('\n')}`);
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
