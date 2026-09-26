import type { ToolDef } from './env';

const COMMON_TOOLS = new Set(['think', 'get_time', 'memory_search', 'knowledge_search', 'knowledge_read', 'knowledge_analyze', 'analysis_archive']);

/** Selecciona un catálogo pequeño y relevante para no agotar el contexto del modelo. */
export function relevantToolDefs(defs: ToolDef[], query: string): ToolDef[] {
  const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const selected = new Set(COMMON_TOOLS);
  const add = (...names: string[]) => names.forEach((name) => selected.add(name));

  if (/agenda|calendario|evento|cita|visita|acompanamiento|reunion|viaje|farmacia|hoy|manana|semana|hora/.test(q))
    add('agenda', 'calendar_calendars', 'calendar_list', 'calendar_create', 'calendar_update', 'calendar_delete', 'pharmacy_visit_create', 'crm_synchronize');
  if (/tarea|recordatorio|pendiente|google task|programad|avisame|recuerdame/.test(q))
    add('gtasks_lists', 'gtasks_list', 'gtasks_create', 'gtasks_complete', 'schedule_task', 'list_tasks', 'cancel_task');
  if (/correo|email|gmail|borrador|mensaje|responde|redacta|asunto/.test(q))
    add('gmail_search', 'gmail_read', 'gmail_draft', 'gmail_send', 'gmail_mark', 'gmail_trash');
  if (/drive|carpeta|archivo|documento|pdf|excel|word|transcripcion|sube|guardar/.test(q))
    add('drive_search', 'drive_read', 'drive_import_knowledge', 'drive_folder_import_knowledge', 'drive_create_doc', 'drive_append_doc', 'drive_upload_text', 'drive_trash', 'knowledge_add', 'knowledge_list');
  if (/crm|sincron|visitas|acompanamientos|xlsx|cuadro de mando|dashboard/.test(q)) add('crm_synchronize', 'drive_search', 'drive_read');
  if (/internet|web|busca|investiga|precio|noticia|direccion|restaurante|tiempo|tienda/.test(q)) add('web_search', 'fetch_url', 'http_request', 'run_code');
  if (/calcula|estadistica|analiza|compara|transforma|tabla|formula|datos/.test(q)) add('run_code', 'subtask');
  if (/recuerda|memoria|aprende|olvida|conocimiento|instruccion/.test(q)) add('memory_save', 'memory_list', 'memory_forget', 'knowledge_add', 'knowledge_list', 'knowledge_forget', 'self_instruct', 'lesson_save');
  if (/habilidad|skill|herramienta|api|secreto|credencial|automatiza/.test(q)) add('skill_list', 'skill_get', 'skill_save', 'tool_list', 'tool_create', 'tool_delete', 'secret_list', 'http_request', 'run_code');

  if (selected.size === COMMON_TOOLS.size) add('web_search', 'fetch_url', 'run_code', 'memory_save', 'knowledge_add', 'subtask');
  return defs.filter((def) => selected.has(def.name));
}
