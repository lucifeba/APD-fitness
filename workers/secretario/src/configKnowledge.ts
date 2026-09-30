import type { Env } from './env';
import { getSetting, setSetting } from './db';
import { remember } from './memory';
import { now } from './util';

export const TELEGRAM_CONFIGURATION_KEY = 'telegram_configuration_knowledge';

export interface ConfigurationInstruction {
  text: string;
  source: 'telegram';
  savedAt: string;
}

const CONFIGURATION_PATTERNS = [
  /\b(?:configura|ajusta|establece|aplica)\b.{0,120}\b(?:siempre|regla|configuraci[oó]n|instrucci[oó]n|preferencia)\b/i,
  /\b(?:a partir de ahora|de ahora en adelante|en adelante|siempre que|quiero que siempre|no vuelvas a|nunca vuelvas a|ten en cuenta siempre)\b/i,
  /\b(?:guarda|incorpora|mete|a[nñ]ade)\b.{0,50}\b(?:conocimiento|memoria|preferencia|instrucciones?)\b/i,
  /\bquiero que\b.{0,140}\b(?:configuraci[oó]n|regla|instrucci[oó]n)\b.{0,100}\b(?:conocimiento|memoria|guard)/i,
];

const SENSITIVE_PATTERN = /\b(?:api[_ -]?key|token|contrase[nñ]a|password|secret[oa]|bearer)\b\s*[:=]?\s*\S{8,}/i;

export function isConfigurationInstruction(text: string): boolean {
  const value = text.trim();
  return value.length >= 12 && !value.startsWith('/') && CONFIGURATION_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsSensitiveConfiguration(text: string): boolean {
  return SENSITIVE_PATTERN.test(text);
}

export function parseConfigurationKnowledge(raw: string | null): ConfigurationInstruction[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ConfigurationInstruction => Boolean(item && typeof item.text === 'string' && item.text.trim()))
      : [];
  } catch {
    return [];
  }
}

export function mergeConfigurationKnowledge(
  current: ConfigurationInstruction[],
  text: string,
  savedAt = now(),
): ConfigurationInstruction[] {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 3000);
  const key = clean.toLocaleLowerCase('es');
  const withoutDuplicate = current.filter((item) => item.text.toLocaleLowerCase('es') !== key);
  return [...withoutDuplicate, { text: clean, source: 'telegram' as const, savedAt }].slice(-80);
}

export async function configurationKnowledge(env: Env): Promise<ConfigurationInstruction[]> {
  return parseConfigurationKnowledge(await getSetting(env, TELEGRAM_CONFIGURATION_KEY));
}

export async function saveConfigurationInstruction(env: Env, text: string): Promise<{ saved: boolean; reason?: 'sensitive' }> {
  const clean = text.trim();
  if (containsSensitiveConfiguration(clean)) return { saved: false, reason: 'sensitive' };
  const current = await configurationKnowledge(env);
  const existed = current.some((item) => item.text.toLocaleLowerCase('es') === clean.toLocaleLowerCase('es'));
  const next = mergeConfigurationKnowledge(current, clean);
  if (!existed) await setSetting(env, TELEGRAM_CONFIGURATION_KEY, JSON.stringify(next));
  await remember(env, clean, 'preference', 'telegram-config', 5).catch((error) =>
    console.warn('telegram config semantic memory', error instanceof Error ? error.message : String(error)),
  );
  return { saved: !existed };
}
