import type { Env } from './env';
import { estimateNeurons } from './router';
import { recordUsage } from './db';
import { extractText } from './knowledge';
import { toBase64 } from './util';

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i;

/** Telegram también permite enviar una imagen como documento, sin MIME fiable. */
export function isImageAttachment(mime?: string, name?: string): boolean {
  return /^image\//i.test(String(mime || '')) || IMAGE_EXTENSION.test(String(name || ''));
}

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
    prompt: prompt || 'Analiza esta imagen con detalle en español. Transcribe íntegramente todo el texto visible, conserva cifras, fechas, nombres, tablas y relaciones espaciales, y explica lo relevante para poder responder preguntas posteriores.',
    max_tokens: 1800,
  });
  const text = String(r?.description ?? r?.response ?? '').trim();
  if (!text) throw new Error('El modelo de visión no devolvió contenido.');
  await recordUsage(env, 'cf', model, 1200, Math.ceil(text.length / 3.5), estimateNeurons(model, 1200, Math.ceil(text.length / 3.5))).catch(() => undefined);
  return text;
}

export function mergeImageAnalysis(ocr: string, vision: string): string {
  const cleanOcr=ocr.trim(),cleanVision=vision.trim();
  if(cleanOcr&&cleanVision){
    if(cleanVision.includes(cleanOcr))return cleanVision;
    return `[Texto extraído por OCR]\n${cleanOcr}\n\n[Interpretación visual]\n${cleanVision}`;
  }
  return cleanOcr||cleanVision;
}

/** Doble vía: OCR documental y visión. Tolera que una falle y exige que al menos una funcione. */
export async function analyzeImage(env:Env,bytes:ArrayBuffer,name='imagen.jpg',mime='image/jpeg',prompt=''){
  const errors:string[]=[];let ocr='',vision='';
  try{vision=await describeImage(env,bytes,prompt);}catch(error){errors.push(`visión: ${error instanceof Error?error.message:String(error)}`);}
  try{ocr=(await extractText(env,name,mime,bytes)).text;}catch(error){errors.push(`OCR: ${error instanceof Error?error.message:String(error)}`);}
  const text=mergeImageAnalysis(ocr,vision);
  if(!text)throw new Error(`No se pudo leer la imagen (${errors.join(' · ')||'sin contenido'}).`);
  return{text,ocr:Boolean(ocr),vision:Boolean(vision),warnings:errors};
}
