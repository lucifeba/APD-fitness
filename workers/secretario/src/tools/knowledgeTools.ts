import { audit } from '../db';
import { driveCreateDoc } from '../google';
import { forgetDocument, getDocument, ingestDocument, ingestUrl, listDocuments, readDocument, searchKnowledge } from '../knowledge';
import { ask } from '../router';
import { clip } from '../util';
import { confirm, num, params, str, type ToolSpec } from './types';

const ANALYSIS_PART_CHARS = 24_000;

function splitForAnalysis(text: string, max = ANALYSIS_PART_CHARS): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.6) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.6) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function mapLimited<T, R>(values: T[], limit: number, fn: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await fn(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

export const knowledgeTools: ToolSpec[] = [
  {
    def: {
      name: 'knowledge_search',
      description:
        'Busca en la base de conocimiento: todos los documentos, archivos, fotos y páginas que el usuario ha guardado (PDF, Word, Excel, notas...). Devuelve los fragmentos más relevantes con su documento. Úsala siempre que la pregunta pueda apoyarse en material guardado.',
      parameters: params({ query: str('Qué buscar, en lenguaje natural.'), k: num('Número de fragmentos, por defecto 6 (máximo 15).') }, ['query']),
    },
    run: async (a, ctx) => {
      const hits = await searchKnowledge(ctx.env, String(a.query), Math.min(15, Number(a.k) || 6));
      return hits.length ? hits.map((h) => ({ doc_id: h.doc_id, title: h.title, fragment: h.idx, score: Number(h.score.toFixed(2)), content: h.content })) : { results: [], nota: 'Nada relevante en la base de conocimiento.' };
    },
  },
  {
    def: {
      name: 'knowledge_add',
      description:
        'Guarda conocimiento de forma permanente en la base de conocimiento (troceado e indexado para búsqueda semántica, con resumen y hechos clave extraídos a la memoria). Acepta texto o una URL (página web, PDF en línea...). Úsala cuando el usuario quiera que "aprendas", "almacenes" o "incorpores" información, o cuando encuentres material valioso.',
      parameters: params(
        { title: str('Título descriptivo.'), text: str('Contenido a guardar (si no das url).'), url: str('URL a descargar e indexar (si no das text).'), source: str('Opcional: de dónde viene (correo, drive, web, usuario...).') },
        ['title'],
      ),
    },
    run: async (a, ctx) => {
      const doc = a.url ? await ingestUrl(ctx.env, String(a.url), String(a.title)) : await ingestDocument(ctx.env, { title: String(a.title), text: String(a.text ?? ''), source: a.source ? String(a.source) : 'tool' });
      await audit(ctx.env, ctx.chatId, 'knowledge_add', { id: doc.id, title: doc.title, chunks: doc.chunks });
      return { saved: true, doc_id: doc.id, title: doc.title, fragments: doc.chunks, chars: doc.chars, facts_saved: doc.facts, summary: doc.summary };
    },
  },
  {
    def: {
      name: 'knowledge_read',
      description: 'Lee un pasaje concreto de un documento guardado. Para analizar el documento entero o varios documentos usa knowledge_analyze en vez de encadenar lecturas parciales.',
      parameters: params({ doc_id: str('Id del documento (d_...).'), from: num('Fragmento inicial, por defecto 0.'), count: num('Cuántos fragmentos, por defecto 8.') }, ['doc_id']),
    },
    run: async (a, ctx) => {
      const r = await readDocument(ctx.env, String(a.doc_id), Number(a.from) || 0, Math.min(20, Number(a.count) || 8));
      return r ? { ...r, text: clip(r.text, 16000) } : { error: 'No existe ese documento.' };
    },
  },
  {
    def: {
      name: 'knowledge_analyze',
      description:
        'Analiza de principio a fin uno o varios documentos ya guardados. Recorre todos sus fragmentos, consolida evidencias y envía directamente al usuario un informe completo. Puede crear además un Google Doc en la carpeta indicada y devuelve siempre su enlace directo. Úsala para transcripciones, reuniones, acompañamientos, formularios, comparativas o análisis conjuntos; evita knowledge_read repetido.',
      parameters: params(
        {
          doc_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, description: 'Ids d_... de los documentos que deben analizarse juntos.' },
          objective: str('Qué análisis, informe o documentos necesita el usuario. Incluye todos sus criterios.'),
          google_doc_title: str('Opcional: título del Google Doc que debe crearse con el informe final.'),
          drive_folder_id: str('Opcional: id de la carpeta de Drive donde debe guardarse el Google Doc.'),
        },
        ['doc_ids', 'objective'],
      ),
    },
    run: async (a, ctx) => {
      const ids = [...new Set((Array.isArray(a.doc_ids) ? a.doc_ids : String(a.doc_ids || '').split(',')).map(String).map((x) => x.trim()).filter(Boolean))].slice(0, 8);
      if (!ids.length) return { error: 'Indica al menos un doc_id.' };
      const objective = String(a.objective || '').trim();
      if (!objective) return { error: 'Indica el objetivo del análisis.' };
      const docs: { id: string; title: string; text: string; total: number }[] = [];
      for (const id of ids) {
        const meta = await getDocument(ctx.env, id);
        if (!meta) continue;
        const full = await readDocument(ctx.env, id, 0, meta.chunks);
        if (full?.text.trim()) docs.push({ id, title: meta.title, text: full.text, total: meta.chunks });
      }
      if (!docs.length) return { error: 'No encuentro ninguno de esos documentos en la base de conocimiento.' };

      const parts = docs.flatMap((doc) => splitForAnalysis(doc.text).map((text, part) => ({ doc, text, part })));
      const notes = await mapLimited(parts, 4, async ({ doc, text, part }) => {
        try {
          return await ask(
            ctx.env,
            'fast',
            `Analizas fielmente una parte de un documento para preparar un informe profesional. Extrae únicamente evidencias presentes en el texto y conserva nombres, farmacias, fechas, cifras, afirmaciones literales relevantes, comportamiento comercial, preguntas, escucha, objeciones, cierres, acuerdos, compromisos, fortalezas y áreas de mejora cuando aparezcan. Separa hechos observados de inferencias razonables. No inventes nada y no redactes todavía el informe final. Devuelve notas estructuradas y compactas en español.`,
            `Objetivo final del usuario:\n${objective}\n\nDocumento: ${doc.title}\nParte ${part + 1} de ${splitForAnalysis(doc.text).length}:\n\n${text}`,
            1400,
          );
        } catch (error) {
          console.warn('knowledge analyze part', doc.id, part, error instanceof Error ? error.message : String(error));
          return `Documento ${doc.title}, parte ${part + 1}:\n${clip(text, 4500)}`;
        }
      });

      let rendered = '';
      try {
        rendered = await ask(
          ctx.env,
          'smart',
          `Eres un experto en dirección comercial farmacéutica, acompañamiento de delegados y análisis de conversaciones. Redacta el entregable final solicitado en español de España, profesional, claro y accionable. Integra todos los documentos, distingue hechos de interpretación, cita evidencias textuales breves cuando aporten valor y no inventes datos. Si el usuario pide material para formularios, crea secciones listas para copiar en cada formulario y una síntesis final del acompañamiento. Incluye conclusiones, fortalezas, áreas de mejora, patrón de objeciones, oportunidades, compromisos y próximos pasos solo cuando estén respaldados. No menciones herramientas, fragmentos ni procesos internos.`,
          `Objetivo:\n${objective}\n\nDocumentos analizados:\n${docs.map((d) => `- ${d.title}`).join('\n')}\n\nEvidencias consolidadas:\n\n${notes.map((note, i) => `### Bloque ${i + 1}\n${note}`).join('\n\n')}`,
          3600,
        );
      } catch (error) {
        console.warn('knowledge analyze synthesis', error instanceof Error ? error.message : String(error));
        rendered = `## Análisis recuperado\n\nNo se ha podido completar la síntesis final, pero estas son las evidencias extraídas sin perder los documentos:\n\n${notes.join('\n\n')}`;
      }
      rendered = rendered.trim();
      let googleDoc: { id: string; url: string; title: string } | undefined;
      if (String(a.google_doc_title || '').trim()) {
        const title = String(a.google_doc_title).trim();
        const created = await driveCreateDoc(ctx.env, title, rendered, a.drive_folder_id ? String(a.drive_folder_id) : undefined);
        googleDoc = { ...created, title };
        rendered += `\n\n📄 [Abrir el documento en Google Docs](${created.url})`;
      }
      await audit(ctx.env, ctx.chatId, 'knowledge_analyze', { documents: docs.map((d) => ({ id: d.id, title: d.title })), parts: parts.length, objective: clip(objective, 500), googleDoc });
      return {
        rendered,
        analyzed: true,
        google_doc: googleDoc,
        documents: docs.map((d) => ({ id: d.id, title: d.title, fragments: d.total })),
        parts: parts.length,
        nota: 'El informe completo ya se ha enviado directamente al usuario. Responde solo con una confirmación breve o con una pregunta imprescindible.',
      };
    },
  },
  {
    def: {
      name: 'knowledge_list',
      description: 'Lista los documentos guardados en la base de conocimiento con su resumen.',
      parameters: params({ limit: num('Por defecto 30.') }),
    },
    run: async (a, ctx) =>
      (await listDocuments(ctx.env, Number(a.limit) || 30)).map((d) => ({ id: d.id, title: d.title, source: d.source, fragments: d.chunks, date: d.created_at.slice(0, 10), summary: clip(d.summary ?? '', 300) })),
  },
  {
    def: {
      name: 'knowledge_forget',
      description: 'Elimina un documento de la base de conocimiento. Requiere confirmación del usuario.',
      parameters: params({ doc_id: str('Id del documento (d_...).'), title: str('Título, para la confirmación.') }, ['doc_id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Eliminar de la base de conocimiento "${a.title ?? a.doc_id}"`);
      const ok = await forgetDocument(ctx.env, String(a.doc_id));
      await audit(ctx.env, ctx.chatId, 'knowledge_forget', a, true);
      return { forgotten: ok };
    },
  },
];
