import * as g from '../google';
import { buildAgenda, renderAgenda } from '../agenda';
import { audit } from '../db';
import { clip, localClock, localParts, localTime, resolveDay } from '../util';
import { confirm, params, str, num, type ToolSpec } from './types';

export const googleTools: ToolSpec[] = [
  {
    def: {
      name: 'gmail_search',
      description: 'Busca correos en Gmail con la sintaxis de búsqueda de Gmail (from:, subject:, newer_than:2d, is:unread, label:...).',
      parameters: params({ query: str('Consulta Gmail.'), max: num('Máximo de resultados, por defecto 8 (máximo 12).') }, ['query']),
    },
    run: async (a, ctx) => g.gmailSearch(ctx.env, String(a.query), Math.min(12, Number(a.max) || 8)),
  },
  {
    def: {
      name: 'gmail_read',
      description: 'Lee un correo completo por id.',
      parameters: params({ id: str('Id del mensaje.'), max_chars: num('Recorte del cuerpo, por defecto 8000.') }, ['id']),
    },
    run: async (a, ctx) => {
      const m = await g.gmailRead(ctx.env, String(a.id));
      return { ...m, body: clip(m.body, Number(a.max_chars) || 8000) };
    },
  },
  {
    def: {
      name: 'gmail_draft',
      description: 'Crea un borrador en Gmail (no envía nada). Úsalo para preparar respuestas que el usuario revisará.',
      parameters: params(
        { to: str('Destinatario.'), subject: str('Asunto.'), body: str('Cuerpo en texto plano.'), reply_to_id: str('Opcional: id del correo al que responde.') },
        ['to', 'subject', 'body'],
      ),
    },
    run: async (a, ctx) => {
      const d = await g.gmailDraft(ctx.env, String(a.to), String(a.subject), String(a.body), undefined, a.reply_to_id ? String(a.reply_to_id) : undefined);
      await audit(ctx.env, ctx.chatId, 'gmail_draft', { to: a.to, subject: a.subject });
      return { draft_id: d.id, url: d.url };
    },
  },
  {
    def: {
      name: 'gmail_send',
      description: 'Envía un correo desde la cuenta del usuario. Requiere confirmación del usuario.',
      parameters: params(
        { to: str('Destinatario.'), subject: str('Asunto.'), body: str('Cuerpo en texto plano.'), reply_to_id: str('Opcional: id del correo al que responde.') },
        ['to', 'subject', 'body'],
      ),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Enviar correo a ${a.to}\nAsunto: ${a.subject}\n\n${clip(String(a.body), 600)}`);
      const id = await g.gmailSend(ctx.env, String(a.to), String(a.subject), String(a.body), a.reply_to_id ? String(a.reply_to_id) : undefined);
      await audit(ctx.env, ctx.chatId, 'gmail_send', { to: a.to, subject: a.subject, id }, true);
      return { sent: true, id };
    },
  },
  {
    def: {
      name: 'gmail_mark',
      description: 'Marca un correo como leído, no leído, destacado o lo archiva (quita de bandeja). No borra nada.',
      parameters: params({ id: str('Id del mensaje.'), action: str('read | unread | star | archive', { enum: ['read', 'unread', 'star', 'archive'] }) }, ['id', 'action']),
    },
    run: async (a, ctx) => {
      const map: Record<string, [string[], string[]]> = { read: [[], ['UNREAD']], unread: [['UNREAD'], []], star: [['STARRED'], []], archive: [[], ['INBOX']] };
      const [add, remove] = map[String(a.action)] ?? [[], []];
      await g.gmailModify(ctx.env, String(a.id), add, remove);
      return { ok: true };
    },
  },
  {
    def: {
      name: 'gmail_trash',
      description: 'Mueve un correo a la papelera (recuperable 30 días). Requiere confirmación del usuario.',
      parameters: params({ id: str('Id del mensaje.'), subject: str('Asunto, para mostrarlo en la confirmación.') }, ['id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Mover a la papelera el correo "${a.subject ?? a.id}"`);
      await g.gmailTrash(ctx.env, String(a.id));
      await audit(ctx.env, ctx.chatId, 'gmail_trash', { id: a.id, subject: a.subject }, true);
      return { trashed: true };
    },
  },
  {
    def: {
      name: 'agenda',
      description:
        'Agenda completa de un día o de varios: eventos de TODOS los calendarios de Google y tareas de Google Tasks (las que vencen esos días, las vencidas y las sin fecha). Úsala siempre para "qué tengo", "planes", "agenda", "reuniones", "tareas pendientes". Devuelve `rendered`, un texto ya formateado que puedes enviar tal cual, además de los datos.',
      parameters: params(
        {
          date: str('Día de inicio: "hoy", "mañana", "pasado mañana", "ayer", un día de la semana (lunes…domingo, el próximo), DD/MM o YYYY-MM-DD. Por defecto hoy.'),
          days: num('Número de días a mostrar desde esa fecha (1 por defecto, 7 para una semana, máximo 31).'),
        },
      ),
    },
    run: async (a, ctx) => {
      const day = resolveDay(String(a.date ?? 'hoy'), ctx.tz);
      if (!day) return { error: `No entiendo la fecha "${a.date}". Usa hoy, mañana, un día de la semana, DD/MM o YYYY-MM-DD. Hoy es ${localParts(ctx.tz).date}.` };
      const ag = await buildAgenda(ctx.env, ctx.tz, day, Number(a.days) || 1);
      return {
        rendered: renderAgenda(ag, ctx.tz),
        from: ag.from,
        to: ag.to,
        calendars: ag.calendars.map((c) => c.name),
        days: ag.days.map((d) => ({
          date: d.date,
          events: d.events.map((e) => ({ id: e.id, calendar_id: e.calendarId, calendar: e.calendar, summary: e.summary, start: e.start, end: e.end, allDay: e.allDay, location: e.location })),
          tasks: d.tasks.map((t) => ({ id: t.id, list_id: t.listId, list: t.list, title: t.title, due: t.due })),
        })),
        overdue: ag.overdue.map((t) => ({ id: t.id, list_id: t.listId, list: t.list, title: t.title, due: t.due })),
        undated_count: ag.undated.length,
        warnings: ag.warnings,
      };
    },
  },
  {
    def: {
      name: 'calendar_calendars',
      description: 'Lista los calendarios de la cuenta de Google (id, nombre, si es el principal). Útil para elegir calendar_id al crear o modificar eventos.',
      parameters: params({}),
    },
    run: async (_a, ctx) => (await g.calendarsList(ctx.env, true)).map((c) => ({ id: c.id, name: c.name, primary: c.primary, access: c.accessRole })),
  },
  {
    def: {
      name: 'calendar_list',
      description: 'Lista eventos entre dos instantes ISO 8601. Sin calendar_id busca en TODOS los calendarios. Para "qué tengo tal día" prefiere la herramienta agenda.',
      parameters: params(
        { from: str('Inicio ISO 8601, p. ej. 2026-09-03T00:00:00+02:00'), to: str('Fin ISO 8601.'), max: num('Por defecto 50.'), calendar_id: str('Opcional: limitar a un calendario.') },
        ['from', 'to'],
      ),
    },
    run: async (a, ctx) => {
      const from = new Date(String(a.from));
      const to = new Date(String(a.to));
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
        return { error: `Fechas inválidas (from="${a.from}", to="${a.to}"). Ahora es ${localTime(ctx.tz)} (${ctx.tz}), en UTC ${new Date().toISOString()}. Usa ISO 8601 completo, p. ej. 2026-09-05T00:00:00+02:00.` };
      const evs = await g.calendarList(ctx.env, from.toISOString(), to.toISOString(), Number(a.max) || 50, a.calendar_id ? String(a.calendar_id) : undefined);
      return evs.map((e) => ({ ...e, start_local: e.allDay ? e.start : `${localParts(ctx.tz, new Date(e.start)).date} ${localClock(ctx.tz, e.start)}`, end_local: e.allDay ? e.end : `${localParts(ctx.tz, new Date(e.end)).date} ${localClock(ctx.tz, e.end)}` }));
    },
  },
  {
    def: {
      name: 'calendar_create',
      description: 'Crea un evento en el calendario. Requiere confirmación del usuario.',
      parameters: params(
        {
          summary: str('Título.'),
          start: str('Inicio ISO 8601 con zona horaria, o YYYY-MM-DD para todo el día.'),
          end: str('Fin ISO 8601, o YYYY-MM-DD (exclusivo) para todo el día.'),
          description: str('Opcional.'),
          location: str('Opcional.'),
          attendees: { type: 'array', items: { type: 'string' }, description: 'Opcional: correos de invitados.' },
          calendar_id: str('Opcional: calendario destino (ver calendar_calendars). Por defecto el principal.'),
        },
        ['summary', 'start', 'end'],
      ),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Crear evento "${a.summary}" de ${a.start} a ${a.end}${a.location ? ` en ${a.location}` : ''}${a.attendees?.length ? ` con ${a.attendees.join(', ')}` : ''}${a.calendar_id ? ` en el calendario ${a.calendar_id}` : ''}`);
      const ev = await g.calendarCreate(ctx.env, a as any, ctx.tz);
      await audit(ctx.env, ctx.chatId, 'calendar_create', ev, true);
      return ev;
    },
  },
  {
    def: {
      name: 'calendar_update',
      description: 'Modifica un evento existente (título, horas, lugar, descripción). Requiere confirmación del usuario.',
      parameters: params(
        { id: str('Id del evento.'), calendar_id: str('Calendario al que pertenece el evento (lo da agenda o calendar_list). Por defecto el principal.'), summary: str('Nuevo título.'), start: str('Nuevo inicio ISO.'), end: str('Nuevo fin ISO.'), location: str(''), description: str('') },
        ['id'],
      ),
    },
    dangerous: true,
    run: async (a, ctx) => {
      const { id, calendar_id, ...patch } = a;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== ''));
      if (!ctx.confirmed) return confirm(`Modificar evento ${id}: ${JSON.stringify(clean)}`);
      const ev = await g.calendarUpdate(ctx.env, String(id), clean, ctx.tz, calendar_id ? String(calendar_id) : undefined);
      await audit(ctx.env, ctx.chatId, 'calendar_update', ev, true);
      return ev;
    },
  },
  {
    def: {
      name: 'calendar_delete',
      description: 'Elimina un evento del calendario. Requiere confirmación del usuario.',
      parameters: params({ id: str('Id del evento.'), calendar_id: str('Calendario al que pertenece (lo da agenda o calendar_list). Por defecto el principal.'), summary: str('Título, para la confirmación.') }, ['id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Eliminar el evento "${a.summary ?? a.id}"`);
      await g.calendarDelete(ctx.env, String(a.id), a.calendar_id ? String(a.calendar_id) : undefined);
      await audit(ctx.env, ctx.chatId, 'calendar_delete', a, true);
      return { deleted: true };
    },
  },
  {
    def: {
      name: 'drive_search',
      description: 'Busca archivos en Google Drive por nombre o contenido.',
      parameters: params({ query: str('Texto a buscar.'), folder_id: str('Opcional: limitar a una carpeta.'), max: num('Por defecto 10.') }, ['query']),
    },
    run: async (a, ctx) => g.driveSearch(ctx.env, String(a.query), Number(a.max) || 10, a.folder_id ? String(a.folder_id) : undefined),
  },
  {
    def: {
      name: 'drive_read',
      description: 'Lee el texto de un documento, hoja o archivo de texto de Drive.',
      parameters: params({ file_id: str('Id del archivo.'), max_chars: num('Por defecto 12000.') }, ['file_id']),
    },
    run: async (a, ctx) => {
      const f = await g.driveRead(ctx.env, String(a.file_id));
      return { ...f, text: clip(f.text, Number(a.max_chars) || 12000) };
    },
  },
  {
    def: {
      name: 'drive_create_doc',
      description: 'Crea un Google Doc con el contenido indicado. Útil para guardar notas, transcripciones, informes.',
      parameters: params({ title: str('Título del documento.'), content: str('Texto del documento.'), folder_id: str('Opcional: carpeta destino.') }, ['title', 'content']),
    },
    run: async (a, ctx) => {
      const d = await g.driveCreateDoc(ctx.env, String(a.title), String(a.content), a.folder_id ? String(a.folder_id) : undefined);
      await audit(ctx.env, ctx.chatId, 'drive_create_doc', { title: a.title, id: d.id });
      return d;
    },
  },
  {
    def: {
      name: 'drive_append_doc',
      description: 'Añade texto al final de un Google Doc existente.',
      parameters: params({ doc_id: str('Id del documento.'), text: str('Texto a añadir.') }, ['doc_id', 'text']),
    },
    run: async (a, ctx) => {
      await g.driveAppendDoc(ctx.env, String(a.doc_id), String(a.text));
      return { ok: true };
    },
  },
  {
    def: {
      name: 'drive_upload_text',
      description: 'Sube un archivo de texto (txt, md, csv, json) a Drive.',
      parameters: params({ name: str('Nombre con extensión.'), content: str('Contenido.'), mime: str('text/plain, text/markdown, text/csv o application/json'), folder_id: str('Opcional.') }, ['name', 'content']),
    },
    run: async (a, ctx) => g.driveUploadText(ctx.env, String(a.name), String(a.content), String(a.mime || 'text/plain'), a.folder_id ? String(a.folder_id) : undefined),
  },
  {
    def: {
      name: 'drive_trash',
      description: 'Mueve un archivo de Drive a la papelera. Requiere confirmación del usuario.',
      parameters: params({ file_id: str('Id del archivo.'), name: str('Nombre, para la confirmación.') }, ['file_id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Mover a la papelera de Drive "${a.name ?? a.file_id}"`);
      await g.driveTrash(ctx.env, String(a.file_id));
      await audit(ctx.env, ctx.chatId, 'drive_trash', a, true);
      return { trashed: true };
    },
  },
  {
    def: {
      name: 'gtasks_lists',
      description: 'Lista las listas de Google Tasks (id y nombre).',
      parameters: params({}),
    },
    run: async (_a, ctx) => g.taskLists(ctx.env, true),
  },
  {
    def: {
      name: 'gtasks_list',
      description: 'Tareas pendientes de Google Tasks de TODAS las listas (o de una), ordenadas por vencimiento. Cada tarea indica su lista.',
      parameters: params({ max: num('Por defecto 50.'), list: str('Opcional: nombre o id de una lista.'), due_before: str('Opcional: solo las que vencen antes de esta fecha YYYY-MM-DD (exclusivo).') }),
    },
    run: async (a, ctx) => g.tasksList(ctx.env, Number(a.max) || 50, { listRef: a.list ? String(a.list) : undefined, dueBefore: a.due_before ? String(a.due_before) : undefined }),
  },
  {
    def: {
      name: 'gtasks_create',
      description:
        'Crea una tarea en Google Tasks (en la lista indicada o en la predeterminada). Google Tasks solo guarda la fecha: si el usuario da una hora, pásala en `time` y quedará en las notas; el sistema avisa por Telegram automáticamente 15 minutos antes (y de las tareas sin hora, a primera hora del día).',
      parameters: params(
        { title: str('Título.'), notes: str('Opcional.'), due: str('Opcional: fecha de vencimiento (hoy, mañana, lunes, DD/MM o YYYY-MM-DD).'), time: str('Opcional: hora HH:MM si el usuario la indica.'), list: str('Opcional: nombre o id de la lista.') },
        ['title'],
      ),
    },
    run: async (a, ctx) => {
      let due: string | undefined;
      if (a.due) {
        const d = resolveDay(String(a.due), ctx.tz) ?? (Number.isNaN(new Date(String(a.due)).getTime()) ? null : new Date(String(a.due)).toISOString().slice(0, 10));
        if (!d) return { error: `Fecha de vencimiento inválida: "${a.due}". Usa YYYY-MM-DD.` };
        due = `${d}T00:00:00.000Z`;
      }
      const time = a.time ? String(a.time).match(/^([01]?\d|2[0-3]):([0-5]\d)$/) : null;
      const hhmm = time ? `${time[1].padStart(2, '0')}:${time[2]}` : undefined;
      const notes = [hhmm ? `Hora: ${hhmm}` : '', a.notes ? String(a.notes) : ''].filter(Boolean).join('\n') || undefined;
      const r = await g.tasksCreate(ctx.env, String(a.title), notes, due, a.list ? String(a.list) : undefined);
      return { ...r, due: due?.slice(0, 10), time: hhmm, aviso: hhmm && due ? `15 min antes de las ${hhmm}` : due ? 'repaso de tareas del día a primera hora' : 'sin aviso (no tiene fecha)' };
    },
  },
  {
    def: {
      name: 'gtasks_complete',
      description: 'Marca una tarea de Google Tasks como completada. Requiere confirmación del usuario.',
      parameters: params({ id: str('Id de la tarea.'), list_id: str('Id de la lista a la que pertenece (lo dan agenda y gtasks_list).'), title: str('Título, para la confirmación.') }, ['id', 'list_id']),
    },
    dangerous: true,
    run: async (a, ctx) => {
      if (!ctx.confirmed) return confirm(`Marcar como completada la tarea "${a.title ?? a.id}"`);
      await g.tasksComplete(ctx.env, String(a.list_id), String(a.id));
      await audit(ctx.env, ctx.chatId, 'gtasks_complete', a, true);
      return { completed: true };
    },
  },
];
