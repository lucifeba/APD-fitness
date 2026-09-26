import { audit } from '../db';
import { driveCreateDoc, sheetsAppendRows, sheetsReadValues } from '../google';
import { forgetDocument, getDocument, ingestDocument, ingestUrl, listDocuments, readDocument, searchKnowledge } from '../knowledge';
import { ask } from '../router';
import { clip } from '../util';
import { confirm, num, params, str, type ToolSpec } from './types';

const ANALYSIS_PART_CHARS = 24_000;
const ANALYSIS_SHEET_ID = '1pZmmMvQgQPYC_hFIvjwt4Tsvqf0aKMmdnxz_lKkB2vo';

function val(source: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  return '';
}

function formText(title: string, fields: Record<string, any>): string {
  return `# ${title}\n\n${Object.entries(fields).map(([key, value]) => `## ${key}\n${Array.isArray(value) ? value.join('; ') : String(value ?? '')}`).join('\n\n')}`;
}

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
      name: 'analysis_archive',
      description:
        'Archiva un análisis de acompañamiento ya realizado. Crea un Google Doc de acompañamiento y un Google Doc por visita en la carpeta del delegado, y añade todas las filas a la base común de Google Sheets. Úsala siempre después de knowledge_analyze para visitas o acompañamientos. No inventes campos ausentes: escribe Pendiente de validar.',
      parameters: params(
        {
          delegate: str('Nombre completo del delegado.'),
          zone: str('Madrid Sur o Aragón.'),
          date: str('Fecha YYYY-MM-DD.'),
          delegate_folder_id: str('ID de la subcarpeta de Drive del delegado.'),
          source_folder_url: str('URL de la subcarpeta o fuente analizada.'),
          accompaniment: {
            type: 'object',
            description: 'Campos del formulario de acompañamiento. Usa nombres descriptivos: tipo_registro, ruta_planificada, ruta_realizada, visitas_planificadas, visitas_efectivas, motivo_no_efectivas, capacidad_atencion, generacion_oportunidades, comportamiento_general, evidencia_oportunidades, preparacion, apertura, deteccion_necesidades, argumentacion, gestion_objeciones, cierre, fortaleza, ejemplo_fortaleza, area_mejora, evidencia_mejora, freno, objeciones_internas, reaccion_dificultad, trabajo_recomendado, motivacion, seguridad, feedback, motivadores, necesidad_desarrollo, apoyo, prioridad, compromiso, indicadores, conclusion, semaforo.',
            additionalProperties: true,
          },
          visits: {
            type: 'array',
            maxItems: 20,
            description: 'Una entrada por farmacia, con farmacia, interlocutores, puesto, informacion, necesidades, objeciones, puntos_g, no_funciono, funciono, comentarios y transcript_url.',
            items: { type: 'object', additionalProperties: true },
          },
        },
        ['delegate', 'zone', 'date', 'delegate_folder_id', 'accompaniment', 'visits'],
      ),
    },
    run: async (a, ctx) => {
      const delegate = String(a.delegate).trim(), zone = String(a.zone).trim(), date = String(a.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'La fecha debe ser YYYY-MM-DD.' };
      const folderId = String(a.delegate_folder_id).trim();
      const accompaniment = (a.accompaniment && typeof a.accompaniment === 'object' ? a.accompaniment : {}) as Record<string, any>;
      const visits = (Array.isArray(a.visits) ? a.visits : []).filter((x: any) => x && typeof x === 'object').slice(0, 20) as Record<string, any>[];
      const slug = delegate.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
      const accompanimentId = `AC-${date}-${slug}`;
      const mainTitle = `Acompañamiento ${delegate} ${date}`;
      const mainDoc = await driveCreateDoc(ctx.env, mainTitle, formText(mainTitle, { Delegado: delegate, Fecha: date, Zona: zone, ...accompaniment }), folderId);

      const visitDocs: { id: string; pharmacy: string; url: string; source?: string }[] = [];
      for (let index = 0; index < visits.length; index++) {
        const visit = visits[index], pharmacy = String(val(visit, 'farmacia', 'pharmacy') || `Visita ${index + 1}`);
        const title = `Objeciones ${pharmacy} ${date}`;
        const created = await driveCreateDoc(ctx.env, title, formText(title, { Delegado: delegate, Fecha: date, Farmacia: pharmacy, ...visit }), folderId);
        visitDocs.push({ id: `VI-${date}-${slug}-${String(index + 1).padStart(2, '0')}`, pharmacy, url: created.url, source: String(val(visit, 'transcript_url', 'transcripcion') || '') });
      }

      const existingAccomp = new Set((await sheetsReadValues(ctx.env, ANALYSIS_SHEET_ID, 'Acompañamientos!A2:A')).flat().map(String));
      const existingVisits = new Set((await sheetsReadValues(ctx.env, ANALYSIS_SHEET_ID, "'Visitas y objeciones'!A2:A")).flat().map(String));
      const sourceFolder = String(a.source_folder_url || `https://drive.google.com/drive/folders/${folderId}`);
      const accompanimentRow = [
        accompanimentId, delegate, zone, date, val(accompaniment, 'tipo_registro'), val(accompaniment, 'ruta_planificada'), val(accompaniment, 'ruta_realizada'),
        val(accompaniment, 'visitas_planificadas'), val(accompaniment, 'visitas_efectivas'), val(accompaniment, 'motivo_no_efectivas'), val(accompaniment, 'capacidad_atencion'),
        val(accompaniment, 'generacion_oportunidades'), val(accompaniment, 'comportamiento_general'), val(accompaniment, 'evidencia_oportunidades'), val(accompaniment, 'preparacion'),
        val(accompaniment, 'apertura'), val(accompaniment, 'deteccion_necesidades'), val(accompaniment, 'argumentacion'), val(accompaniment, 'gestion_objeciones'), val(accompaniment, 'cierre'),
        val(accompaniment, 'fortaleza'), val(accompaniment, 'ejemplo_fortaleza'), val(accompaniment, 'area_mejora'), val(accompaniment, 'evidencia_mejora'), val(accompaniment, 'freno'),
        val(accompaniment, 'objeciones_internas'), val(accompaniment, 'reaccion_dificultad'), val(accompaniment, 'trabajo_recomendado'), val(accompaniment, 'motivacion'),
        val(accompaniment, 'seguridad'), val(accompaniment, 'feedback'), val(accompaniment, 'motivadores'), val(accompaniment, 'necesidad_desarrollo'), val(accompaniment, 'apoyo'),
        val(accompaniment, 'prioridad'), val(accompaniment, 'compromiso'), val(accompaniment, 'indicadores'), val(accompaniment, 'conclusion'), val(accompaniment, 'semaforo'),
        mainDoc.url, sourceFolder, val(accompaniment, 'estado_validacion') || 'Generado desde transcripciones',
      ];
      if (!existingAccomp.has(accompanimentId)) await sheetsAppendRows(ctx.env, ANALYSIS_SHEET_ID, 'Acompañamientos!A:AP', [accompanimentRow]);

      const visitRows = visits.map((visit, index) => {
        const doc = visitDocs[index];
        return [doc.id, accompanimentId, delegate, zone, date, doc.pharmacy, val(visit, 'interlocutores'), val(visit, 'puesto'), val(visit, 'informacion'), val(visit, 'necesidades'), val(visit, 'objeciones'), val(visit, 'puntos_g'), val(visit, 'no_funciono'), val(visit, 'funciono'), val(visit, 'comentarios'), doc.url, doc.source || '', sourceFolder, val(visit, 'estado_validacion') || 'Generado desde transcripción'];
      }).filter((row) => !existingVisits.has(String(row[0])));
      if (visitRows.length) await sheetsAppendRows(ctx.env, ANALYSIS_SHEET_ID, "'Visitas y objeciones'!A:S", visitRows);
      await audit(ctx.env, ctx.chatId, 'analysis_archive', { accompanimentId, delegate, date, visits: visitDocs.length, mainDoc: mainDoc.url });
      return {
        archived: true,
        accompaniment_id: accompanimentId,
        google_sheet: `https://docs.google.com/spreadsheets/d/${ANALYSIS_SHEET_ID}`,
        accompaniment_document: mainDoc,
        visit_documents: visitDocs,
        rendered: `Documentos archivados para ${delegate}.\n\n📄 [Acompañamiento](${mainDoc.url})\n${visitDocs.map((d) => `📄 [${d.pharmacy}](${d.url})`).join('\n')}\n📊 [Abrir la base común](https://docs.google.com/spreadsheets/d/${ANALYSIS_SHEET_ID})`,
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
