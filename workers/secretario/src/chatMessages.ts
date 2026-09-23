import type { ChatMessage } from './env';

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`);

/**
 * Historial portátil entre proveedores.
 *
 * Gemini y los modelos de razonamiento exigen metadatos opacos (thought_signature /
 * reasoning items) cuando se reenvía una llamada nativa. Como Aravitas puede cambiar
 * de proveedor en mitad de una tarea, conservamos el significado de la llamada y su
 * resultado como texto. Así ningún proveedor recibe identificadores o firmas creados
 * por otro y todos pueden continuar el trabajo con el mismo contexto.
 */
export function portableMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const calls = m.tool_calls.map((c) => `[Llamada de herramienta: ${c.name} ${JSON.stringify(c.arguments ?? {})}]`).join('\n');
      return { role: 'assistant', content: [m.content, calls].filter(Boolean).join('\n') };
    }
    if (m.role === 'tool') return { role: 'user', content: `[Resultado de herramienta ${m.name ?? 'tool'}]\n${m.content}` };
    return { role: m.role, content: m.content };
  });
}

/** Limita el contexto sin perder el sistema ni los mensajes más recientes. */
export function compactMessages(messages: ChatMessage[], maxChars = 48_000): ChatMessage[] {
  const portable = portableMessages(messages);
  const system = portable.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = portable.filter((m) => m.role !== 'system');
  const out: ChatMessage[] = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const content = clip(rest[i].content || '', 8_000);
    if (out.length && used + content.length > maxChars - Math.min(system.length, 18_000)) break;
    out.unshift({ role: rest[i].role, content });
    used += content.length;
  }
  const omitted = Math.max(0, rest.length - out.length);
  const systemText = clip(system, Math.max(8_000, maxChars - used));
  return [
    ...(systemText ? [{ role: 'system' as const, content: systemText }] : []),
    ...(omitted ? [{ role: 'user' as const, content: `[Se han compactado ${omitted} mensajes antiguos; conserva el objetivo actual y usa los resultados recientes.]` }] : []),
    ...out,
  ];
}
