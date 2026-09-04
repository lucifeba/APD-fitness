import { audit } from '../db';
import { forgetDocument, ingestDocument, ingestUrl, listDocuments, readDocument, searchKnowledge } from '../knowledge';
import { clip } from '../util';
import { confirm, num, params, str, type ToolSpec } from './types';

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
      description: 'Lee un documento guardado por tramos (fragmentos consecutivos), para repasarlo entero cuando la búsqueda no basta.',
      parameters: params({ doc_id: str('Id del documento (d_...).'), from: num('Fragmento inicial, por defecto 0.'), count: num('Cuántos fragmentos, por defecto 8.') }, ['doc_id']),
    },
    run: async (a, ctx) => {
      const r = await readDocument(ctx.env, String(a.doc_id), Number(a.from) || 0, Math.min(20, Number(a.count) || 8));
      return r ? { ...r, text: clip(r.text, 16000) } : { error: 'No existe ese documento.' };
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
