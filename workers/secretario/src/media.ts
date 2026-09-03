import type { Env } from './env';
import { estimateNeurons } from './router';
import { recordUsage } from './db';
import { toBase64 } from './util';

/** Transcribe audio (ogg/opus de Telegram, mp3, m4a, wav) con Whisper en Workers AI. */
export async function transcribe(env: Env, bytes: ArrayBuffer, hint?: string): Promise<{ text: string; seconds: number }> {
  const model = env.MODEL_STT || '@cf/openai/whisper-large-v3-turbo';
  const r: any = await (env.AI as any).run(model, {
    audio: toBase64(bytes),
    task: 'transcribe',
    language: env.LANGUAGE || 'es',
    vad_filter: true,
    initial_prompt: hint || 'Nota de voz en español de España sobre entrenamiento, nutrición, negocio y agenda.',
  });
  const seconds = Number(r?.transcription_info?.duration ?? 0) || Math.round(bytes.byteLength / 4000);
  await recordUsage(env, 'cf', model, 0, 0, (seconds / 60) * 46.63).catch(() => undefined);
  return { text: String(r?.text ?? '').trim(), seconds };
}

/** Describe una imagen con un modelo de visión. */
export async function describeImage(env: Env, bytes: ArrayBuffer, prompt: string): Promise<string> {
  const model = env.MODEL_VISION || '@cf/meta/llama-3.2-11b-vision-instruct';
  const r: any = await (env.AI as any).run(model, {
    image: Array.from(new Uint8Array(bytes)),
    prompt: prompt || 'Describe con detalle esta imagen en español. Si contiene texto, transcríbelo íntegro.',
    max_tokens: 800,
  });
  const text = String(r?.description ?? r?.response ?? '').trim();
  await recordUsage(env, 'cf', model, 1200, Math.ceil(text.length / 3.5), estimateNeurons(model, 1200, Math.ceil(text.length / 3.5))).catch(() => undefined);
  return text;
}
