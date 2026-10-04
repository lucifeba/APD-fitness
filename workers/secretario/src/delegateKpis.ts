import { strFromU8, Unzip, UnzipInflate } from 'fflate';
import type { Env } from './env';
import { audit } from './db';
import { uid } from './util';

type Cell = string | number | boolean | null;
type RawRow = Record<string, Cell>;
export type DelegateKpiKind = 'planning' | 'report';

export interface DelegateKpiRow {
  rowNumber: number;
  activityDate: string;
  delegateKey: string;
  delegate: string;
  clientKey: string;
  pharmacy: string;
  nif: string;
  externalId: string;
  classification: string;
  route: string;
  address: string;
  city: string;
  effective: number | null;
  orderDone: string;
  accompanied: string;
  visitTime: string;
  conclusions: string;
  nextStep: string;
  growthProposal: string;
}

export interface ParsedDelegateKpiWorkbook {
  kind: DelegateKpiKind;
  period: string;
  rows: DelegateKpiRow[];
  delegates: string[];
  warnings: string[];
  sheets: string[];
}

export const DELEGATE_KPI_DEFINITIONS = [
  { id: 'push_growth', name: 'Venta PUSH', unit: '€ de incremento', frequency: 'Semanal y cierre de ciclo', question: '¿Cuánto crecimiento PUSH te marcas este Q y en qué clientes lo vas a conseguir?' },
  { id: 'opportunity_pharmacies', name: 'Farmacias oportunidad', unit: 'farmacias', frequency: 'Quincenal', question: '¿Qué farmacias tienen potencial real de crecer y cómo las vas a desarrollar?' },
  { id: 'opportunity_progress', name: 'Desarrollo de farmacias oportunidad', unit: 'avances reales', frequency: 'Semanal o quincenal', question: '¿En cuáles ya has provocado un avance real?' },
  { id: 'decline_recovery', name: 'Reducción del decrecimiento', unit: '€ recuperados', frequency: 'Semanal y cierre de ciclo', question: '¿En qué clientes vas a recuperar el decrecimiento y con qué acción?' },
  { id: 'appointments', name: 'Citas concertadas', unit: 'citas al día', frequency: 'Semanal', question: '¿Cuántas citas reales has cerrado y con qué objetivo comercial?', defaultTarget: 2 },
  { id: 'effective_visits', name: 'Visitas efectivas', unit: 'visitas', frequency: 'Semanal', question: '¿Cuántas visitas han generado una oportunidad o siguiente paso?' },
  { id: 'nonclient_openings', name: 'Apertura de no clientes', unit: 'aperturas', frequency: 'Semanal', question: '¿En qué no clientes has abierto conversación y qué siguiente paso has cerrado?' },
  { id: 'objections', name: 'Objeciones registradas y trabajadas', unit: 'objeciones', frequency: 'Semanal y mensual', question: '¿Qué objeción se repite más y cómo la estás trabajando?' },
  { id: 'route_compliance', name: 'Cumplimiento de ruta planificada', unit: '%', frequency: 'Semanal', question: '¿La ruta genera oportunidades o solo cubre actividad?' },
  { id: 'next_steps', name: 'Próximos pasos cerrados', unit: 'próximos pasos', frequency: 'Semanal', question: '¿Con cuántos clientes has salido con un siguiente paso claro?' },
] as const;

const DATE_ORIGIN = Date.UTC(1899, 11, 30);
const clean = (value: Cell) => String(value ?? '').trim();
const decode = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const normalizeKpiText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const compactId = (value: string) => normalizeKpiText(value).replace(/\s+/g, '');
const normalizeClientName = (value: string) => normalizeKpiText(value).replace(/\b(farmacia|farm)\b/g, '').replace(/\s+/g, ' ').trim();

function unzipSelected(bytes: Uint8Array, wanted: Set<string>): Record<string, Uint8Array> {
  const output: Record<string, Uint8Array> = {};
  let failure: Error | undefined;
  const unzip = new Unzip((file) => {
    const name = file.name.replace(/^\//, '');
    if (!wanted.has(name)) return;
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, data, final) => {
      if (error) { failure = error; return; }
      chunks.push(data); length += data.length;
      if (final) {
        const merged = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        output[name] = merged;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(bytes, true);
  if (failure) throw failure;
  return output;
}

function workbookParts(bytes: Uint8Array) {
  const core = unzipSelected(bytes, new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml']));
  const workbook = strFromU8(core['xl/workbook.xml'] || new Uint8Array());
  const rels = strFromU8(core['xl/_rels/workbook.xml.rels'] || new Uint8Array());
  if (!workbook || !rels) throw new Error('El archivo no es un XLSX válido.');
  const sheets: { name: string; path: string }[] = [];
  for (const match of workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*name="([^"]+)"[^>]*(?:\w+:)?id="([^"]+)"[^>]*\/?\s*>/g)) {
    const id = match[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const relation = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${id}"[^>]*Target="([^"]+)"`));
    if (!relation) continue;
    let path = relation[1].replace(/^\//, '');
    if (!path.startsWith('xl/')) path = `xl/${path.replace(/^\.\//, '')}`;
    sheets.push({ name: decode(match[1]), path });
  }
  if (!sheets.length) throw new Error('El Excel no contiene hojas legibles.');
  const files = unzipSelected(bytes, new Set([...sheets.map((sheet) => sheet.path), 'xl/sharedStrings.xml']));
  const sharedXml = strFromU8(files['xl/sharedStrings.xml'] || core['xl/sharedStrings.xml'] || new Uint8Array());
  const shared = [...sharedXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((match) => decode([...match[1].matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((part) => part[1]).join('')));
  return { sheets, files, shared };
}

function parseCells(body: string, shared: string[]): RawRow {
  const row: RawRow = {};
  const set = (attrs: string, content = '') => {
    const column = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
    if (!column) return;
    const type = attrs.match(/\bt="([^"]+)"/)?.[1];
    let raw = content.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? '';
    if (type === 'inlineStr') raw = [...content.matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((part) => part[1]).join('');
    let value: Cell = decode(raw);
    if (type === 's') value = shared[Number(raw)] ?? '';
    else if (type === 'b') value = raw === '1';
    else if (type !== 'inlineStr' && raw !== '' && !Number.isNaN(Number(raw))) value = Number(raw);
    row[column] = value;
  };
  for (const cell of body.matchAll(/<(?:\w+:)?c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) set(cell[1], cell[2]);
  for (const cell of body.matchAll(/<(?:\w+:)?c\b([^>]*)\/>/g)) set(cell[1]);
  return row;
}

function sheetRows(xml: string, shared: string[]): { number: number; values: RawRow }[] {
  return [...xml.matchAll(/<(?:\w+:)?row\b(?![^>]*\/>)\s*[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)].map((match) => ({ number: Number(match[1]), values: parseCells(match[2], shared) }));
}

function excelDate(value: Cell): string {
  if (typeof value === 'number' && value > 20_000 && value < 90_000) return new Date(DATE_ORIGIN + value * 86_400_000).toISOString().slice(0, 10);
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return '';
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const iso = `${year}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  return Number.isFinite(Date.parse(`${iso}T00:00:00Z`)) ? iso : '';
}

const aliases = {
  date: ['fecha'], type: ['tipo', 'tipo de actividad'], delegate: ['user', 'usuario', 'delegado', 'representante'], pharmacy: ['quien', 'farmacia', 'cliente'],
  nif: ['nif'], externalId: ['id externo 1', 'vdl', 'codigo cliente'], classification: ['clasificacion fy 25 26', 'clasificacion fy 26 27', 'clasificacion'],
  route: ['rutas', 'ruta'], address: ['direccion'], city: ['ciudad', 'provincia'], effective: ['tipo de visita'], orderDone: ['ha realizado pedido'],
  accompanied: ['visita acompanada'], visitTime: ['horario de visita'], conclusions: ['conclusiones'], nextStep: ['proximos objetivos'], growthProposal: ['propuestas de crecimiento'],
} as const;
type Field = keyof typeof aliases;

function headerMap(row: RawRow): Partial<Record<Field, string>> {
  const result: Partial<Record<Field, string>> = {};
  for (const [column, value] of Object.entries(row)) {
    const normalized = normalizeKpiText(clean(value));
    for (const [field, names] of Object.entries(aliases) as [Field, readonly string[]][]) if (!result[field] && names.includes(normalized)) result[field] = column;
  }
  return result;
}
function headerScore(row: RawRow): number { return Object.keys(headerMap(row)).length; }
function value(row: RawRow, map: Partial<Record<Field, string>>, field: Field): string { return map[field] ? clean(row[map[field]!]) : ''; }
function delegateKey(name: string): string {
  const code = name.match(/(?:^|,|\s)(\d{5,7})(?:\s|$)/)?.[1];
  if (code) return code;
  return normalizeKpiText(name.split(',')[0]).replace(/\s+/g, '-');
}
function clientKey(nif: string, externalId: string, pharmacy: string): string {
  const n = compactId(nif);
  if (n) return `nif:${n}`;
  const external = compactId(externalId);
  if (external) return `id:${external}`;
  return `name:${normalizeClientName(pharmacy)}`;
}

export function parseDelegateKpiWorkbook(input: ArrayBuffer | Uint8Array, kind: DelegateKpiKind): ParsedDelegateKpiWorkbook {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const book = workbookParts(bytes);
  const output: DelegateKpiRow[] = [];
  const warnings: string[] = [];
  let globalRow = 0;
  for (const sheet of book.sheets) {
    const parsed = sheetRows(strFromU8(book.files[sheet.path] || new Uint8Array()), book.shared);
    const header = parsed.slice(0, 25).sort((a, b) => headerScore(b.values) - headerScore(a.values))[0];
    if (!header || headerScore(header.values) < 4) { warnings.push(`${sheet.name}: no se reconocieron las cabeceras.`); continue; }
    const map = headerMap(header.values);
    let currentDelegate = kind === 'planning' ? sheet.name.trim() : '';
    for (const entry of parsed.filter((row) => row.number > header.number)) {
      const row = entry.values;
      const explicitDelegate = value(row, map, 'delegate');
      if (explicitDelegate) currentDelegate = explicitDelegate;
      const activityDate = excelDate(map.date ? row[map.date] : null);
      const pharmacy = value(row, map, 'pharmacy');
      const activityType = normalizeKpiText(value(row, map, 'type'));
      if (!activityDate || !pharmacy || !currentDelegate || (activityType && activityType !== 'visita farmacia')) continue;
      const nif = value(row, map, 'nif');
      const externalId = value(row, map, 'externalId');
      const visitType = normalizeKpiText(value(row, map, 'effective'));
      output.push({
        rowNumber: ++globalRow, activityDate, delegateKey: delegateKey(currentDelegate), delegate: currentDelegate, clientKey: clientKey(nif, externalId, pharmacy), pharmacy,
        nif, externalId, classification: value(row, map, 'classification'), route: value(row, map, 'route'), address: value(row, map, 'address'), city: value(row, map, 'city'),
        effective: kind === 'report' ? (visitType === 'visita efectiva' ? 1 : 0) : null, orderDone: value(row, map, 'orderDone'), accompanied: value(row, map, 'accompanied'),
        visitTime: value(row, map, 'visitTime'), conclusions: value(row, map, 'conclusions'), nextStep: value(row, map, 'nextStep'), growthProposal: value(row, map, 'growthProposal'),
      });
    }
  }
  if (!output.length) throw new Error(kind === 'planning' ? 'No se encontraron visitas planificadas con fecha, delegado y farmacia.' : 'No se encontraron visitas reportadas con fecha, delegado y farmacia.');
  const monthCounts = new Map<string, number>();
  for (const row of output) monthCounts.set(row.activityDate.slice(0, 7), (monthCounts.get(row.activityDate.slice(0, 7)) || 0) + 1);
  const periods = [...monthCounts.entries()].sort((a, b) => b[1] - a[1]);
  const period = periods[0][0];
  if (periods.length > 1) warnings.push(`El archivo contiene varios meses; se ha asignado al periodo ${period}. Los filtros permiten revisar todas las filas de esa importación.`);
  if (output.some((row) => !row.nif && !row.externalId)) warnings.push('Algunas farmacias no tienen NIF ni identificador externo; se cruzarán por nombre normalizado.');
  return { kind, period, rows: output, delegates: [...new Set(output.map((row) => row.delegate))].sort((a, b) => a.localeCompare(b, 'es')), warnings, sheets: book.sheets.map((sheet) => sheet.name) };
}

async function batches(env: Env, statements: D1PreparedStatement[], size = 80): Promise<void> {
  for (let i = 0; i < statements.length; i += size) await env.DB.batch(statements.slice(i, i + size));
}

export async function importDelegateKpiWorkbook(env: Env, input: ArrayBuffer | Uint8Array, sourceName: string, kind: DelegateKpiKind, sourceChannel: string, importedBy: string) {
  const parsed = parseDelegateKpiWorkbook(input, kind);
  const id = uid('kpi_');
  const importedAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO delegate_kpi_imports(id,kind,period,source_name,source_channel,imported_by,imported_at,row_count,delegates_json,warnings_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id, kind, parsed.period, sourceName, sourceChannel, importedBy, importedAt, parsed.rows.length, JSON.stringify(parsed.delegates), JSON.stringify(parsed.warnings)).run();
  await batches(env, parsed.rows.map((row) => env.DB.prepare(`INSERT INTO delegate_kpi_rows(import_id,row_number,activity_date,delegate_key,delegate,client_key,pharmacy,nif,external_id,classification,route,address,city,effective,order_done,accompanied,visit_time,conclusions,next_step,growth_proposal) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, row.rowNumber, row.activityDate, row.delegateKey, row.delegate, row.clientKey, row.pharmacy, row.nif, row.externalId, row.classification, row.route, row.address, row.city, row.effective, row.orderDone, row.accompanied, row.visitTime, row.conclusions, row.nextStep, row.growthProposal)));
  await audit(env, null, 'delegate_kpi_import', { id, kind, period: parsed.period, sourceName, sourceChannel, rows: parsed.rows.length, delegates: parsed.delegates.length });
  return { id, ...parsed, importedAt, sourceName, sourceChannel };
}

export function telegramDelegateKpiSummary(result: Awaited<ReturnType<typeof importDelegateKpiWorkbook>>): string {
  const label = result.kind === 'planning' ? 'planificación' : 'reporte de visitas';
  return `He incorporado el ${label} de ${result.period}: ${result.rows.length} visitas y ${result.delegates.length} delegados. El histórico queda guardado en Seguimiento KPI y se cruzará automáticamente con el otro archivo del mismo mes.${result.warnings.length ? ` Avisos: ${result.warnings.join(' ')}` : ''}`;
}

type DbRow = DelegateKpiRow & { import_id?: string; row_number?: number; activity_date?: string; delegate_key?: string; client_key?: string; external_id?: string; order_done?: string; visit_time?: string; next_step?: string; growth_proposal?: string };
function hydrate(row: any): DelegateKpiRow {
  return { rowNumber: Number(row.row_number), activityDate: row.activity_date, delegateKey: row.delegate_key, delegate: row.delegate, clientKey: row.client_key, pharmacy: row.pharmacy, nif: row.nif, externalId: row.external_id, classification: row.classification, route: row.route, address: row.address, city: row.city, effective: row.effective === null ? null : Number(row.effective), orderDone: row.order_done, accompanied: row.accompanied, visitTime: row.visit_time, conclusions: row.conclusions, nextStep: row.next_step, growthProposal: row.growth_proposal };
}
const percent = (part: number, total: number) => total ? part / total : 0;

function sameClient(a: DelegateKpiRow, b: DelegateKpiRow): boolean {
  const nifA = compactId(a.nif), nifB = compactId(b.nif);
  if (nifA && nifB) return nifA === nifB;
  const externalA = compactId(a.externalId), externalB = compactId(b.externalId);
  if (externalA && externalB && externalA === externalB) return true;
  return Boolean(normalizeClientName(a.pharmacy) && normalizeClientName(a.pharmacy) === normalizeClientName(b.pharmacy));
}

function uniquePharmacies(rows: DelegateKpiRow[]): DelegateKpiRow[] {
  const unique: DelegateKpiRow[] = [];
  for (const row of rows) if (!unique.some((item) => item.delegateKey === row.delegateKey && sameClient(item, row))) unique.push(row);
  return unique;
}

function matchedCounts(planning: DelegateKpiRow[], reports: DelegateKpiRow[]): { total: number; reports: Set<DelegateKpiRow> } {
  const used = new Set<DelegateKpiRow>();
  const matched = new Set<DelegateKpiRow>();
  let total = 0;
  for (const row of reports) {
    const planned = planning.find((candidate) => !used.has(candidate) && candidate.activityDate === row.activityDate && candidate.delegateKey === row.delegateKey && sameClient(candidate, row));
    if (!planned) continue;
    used.add(planned); matched.add(row); total++;
  }
  return { total, reports: matched };
}

function filtersRows(rows: DelegateKpiRow[], query: URLSearchParams): DelegateKpiRow[] {
  const delegate = query.get('delegate') || '', classification = query.get('classification') || '', route = query.get('route') || '', pharmacy = normalizeKpiText(query.get('pharmacy') || '');
  return rows.filter((row) => (!delegate || row.delegateKey === delegate) && (!classification || row.classification === classification) && (!route || row.route === route) && (!pharmacy || normalizeKpiText(row.pharmacy).includes(pharmacy)));
}

function latestByKind(imports: any[], kind: DelegateKpiKind): any | null { return imports.find((row) => row.kind === kind) || null; }

async function salesByPharmacy(env: Env): Promise<{ sourceDate: string; rows: any[] }> {
  const latest = await env.DB.prepare('SELECT id,source_date FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT 1').first<any>();
  if (!latest) return { sourceDate: '', rows: [] };
  const rows = await env.DB.prepare('SELECT vdl,cod_del,delegate,client,classification,current_vrn,variation,route FROM sales_dashboard_clients WHERE import_id=?').bind(latest.id).all<any>();
  return { sourceDate: latest.source_date, rows: rows.results };
}

export function aggregateDelegateKpis(planning: DelegateKpiRow[], reports: DelegateKpiRow[], sales: { sourceDate: string; rows: any[] }) {
  const match = matchedCounts(planning, reports);
  const targetPharmacies = uniquePharmacies(planning);
  const visitedPharmacies = uniquePharmacies(reports);
  const visitedTarget = targetPharmacies.filter((target) => reports.some((row) => row.delegateKey === target.delegateKey && sameClient(target, row)));
  const effective = reports.filter((row) => row.effective === 1).length;
  const nonclientOpenings = reports.filter((row) => row.effective === 1 && /no\s*cliente/i.test(row.classification)).length;
  const nextSteps = reports.filter((row) => row.nextStep.trim()).length;
  const objections = reports.filter((row) => /objeci[oó]n/i.test(`${row.conclusions} ${row.nextStep} ${row.growthProposal}`)).length;
  const classifications = [...new Set(reports.map((row) => row.classification || 'Sin clasificación'))].sort((a, b) => a.localeCompare(b, 'es')).map((classification) => {
    const rows = reports.filter((row) => (row.classification || 'Sin clasificación') === classification), effectiveRows = rows.filter((row) => row.effective === 1).length;
    return { classification, reported: rows.length, effective: effectiveRows, effectiveness: percent(effectiveRows, rows.length) };
  });
  const salesByName = new Map<string, any>();
  for (const item of sales.rows) {
    const key = normalizeClientName(String(item.client || ''));
    const existing = salesByName.get(key);
    if (!existing || Math.abs(Number(item.current_vrn || 0)) > Math.abs(Number(existing.current_vrn || 0))) salesByName.set(key, item);
  }
  const detail: Array<any & { identity: DelegateKpiRow }> = [];
  const ensure = (row: DelegateKpiRow) => {
    let item = detail.find((candidate) => candidate.identity.delegateKey === row.delegateKey && sameClient(candidate.identity, row));
    if (!item) {
      const sale = salesByName.get(normalizeClientName(row.pharmacy));
      item = { identity: row, key: `${row.delegateKey}|${row.clientKey}`, pharmacy: row.pharmacy, delegateKey: row.delegateKey, delegate: row.delegate, classification: row.classification, route: row.route, planned: 0, reported: 0, sameDay: 0, effective: 0, sales: sale ? Number(sale.current_vrn || 0) : null, salesVariation: sale ? Number(sale.variation || 0) : null };
      detail.push(item);
    }
    if (!item.classification && row.classification) item.classification = row.classification;
    if (!item.route && row.route) item.route = row.route;
    return item;
  };
  for (const row of planning) ensure(row).planned++;
  for (const row of reports) {
    const item = ensure(row); item.reported++; if (row.effective === 1) item.effective++;
    if (match.reports.has(row)) item.sameDay++;
  }
  return {
    metrics: { planned: planning.length, reported: reports.length, sameDay: match.total, compliance: percent(match.total, planning.length), effective, effectiveness: percent(effective, reports.length), uniqueTarget: targetPharmacies.length, uniqueVisited: visitedTarget.length, uniqueVisitedAll: visitedPharmacies.length, coverage: percent(visitedTarget.length, targetPharmacies.length), nonclientOpenings, nextSteps, objections },
    classifications,
    pharmacies: detail.map(({ identity: _identity, ...item }) => item).sort((a, b) => b.reported - a.reported || b.planned - a.planned || a.pharmacy.localeCompare(b.pharmacy, 'es')),
    salesSourceDate: sales.sourceDate,
  };
}

async function goalsFor(env: Env, period: string): Promise<any[]> {
  return env.DB.prepare('SELECT period,delegate_key,delegate,goals_json,updated_at FROM delegate_kpi_goals WHERE period=? ORDER BY delegate').bind(period).all<any>().then((result) => result.results.map((row) => ({ ...row, goals: JSON.parse(row.goals_json || '{}') })));
}

export async function delegateKpiDashboard(env: Env, query: URLSearchParams) {
  const allImports = await env.DB.prepare('SELECT * FROM delegate_kpi_imports ORDER BY period DESC,imported_at DESC').all<any>().then((result) => result.results);
  const periods = [...new Set(allImports.map((row) => row.period))];
  const period = query.get('period') || periods[0] || '';
  if (!period) return { empty: true, periods: [], imports: [] };
  const imports = allImports.filter((row) => row.period === period);
  const planningImport = latestByKind(imports, 'planning'), reportImport = latestByKind(imports, 'report');
  const [planningRows, reportRows, sales, goals] = await Promise.all([
    planningImport ? env.DB.prepare('SELECT * FROM delegate_kpi_rows WHERE import_id=? ORDER BY activity_date,row_number').bind(planningImport.id).all<DbRow>().then((result) => result.results.map(hydrate)) : Promise.resolve([]),
    reportImport ? env.DB.prepare('SELECT * FROM delegate_kpi_rows WHERE import_id=? ORDER BY activity_date,row_number').bind(reportImport.id).all<DbRow>().then((result) => result.results.map(hydrate)) : Promise.resolve([]),
    salesByPharmacy(env), goalsFor(env, period),
  ]);
  const allRows = [...planningRows, ...reportRows];
  const delegates = [...new Map(allRows.map((row) => [row.delegateKey, { key: row.delegateKey, name: row.delegate }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const options = {
    delegates,
    classifications: [...new Set(allRows.map((row) => row.classification).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    routes: [...new Set(allRows.map((row) => row.route).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
  };
  const planning = filtersRows(planningRows, query), reports = filtersRows(reportRows, query), dashboard = aggregateDelegateKpis(planning, reports, sales);
  const byDelegate = delegates.map((delegate) => ({ delegate, ...aggregateDelegateKpis(planning.filter((row) => row.delegateKey === delegate.key), reports.filter((row) => row.delegateKey === delegate.key), sales).metrics }));
  return { empty: false, period, periods, imports, selected: { planning: planningImport, report: reportImport }, options, goals, definitions: DELEGATE_KPI_DEFINITIONS, byDelegate, ...dashboard };
}

async function saveGoals(env: Env, body: any, email: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(body.period || '')) || !String(body.delegateKey || '') || !String(body.delegate || '')) throw new Error('Selecciona un periodo y un delegado válidos.');
  const allowed = new Set(DELEGATE_KPI_DEFINITIONS.map((item) => item.id));
  const goals: Record<string, any> = {};
  for (const [key, raw] of Object.entries(body.goals || {})) {
    if (!allowed.has(key as any) || !raw || typeof raw !== 'object') continue;
    const item = raw as any;
    goals[key] = { target: String(item.target ?? '').slice(0, 80), clients: String(item.clients ?? '').slice(0, 4000), action: String(item.action ?? '').slice(0, 4000), training: String(item.training ?? '').slice(0, 4000), frequency: String(item.frequency ?? '').slice(0, 200), result: String(item.result ?? '').slice(0, 1000), nextStep: String(item.nextStep ?? '').slice(0, 2000) };
  }
  const updatedAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO delegate_kpi_goals(period,delegate_key,delegate,goals_json,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(period,delegate_key) DO UPDATE SET delegate=excluded.delegate,goals_json=excluded.goals_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by')
    .bind(body.period, body.delegateKey, body.delegate, JSON.stringify(goals), updatedAt, email).run();
  await audit(env, null, 'delegate_kpi_goals_save', { period: body.period, delegateKey: body.delegateKey, email });
  return { period: body.period, delegateKey: body.delegateKey, delegate: body.delegate, goals, updatedAt };
}

export async function delegateKpiApi(request: Request, env: Env, email: string): Promise<Response> {
  const url = new URL(request.url);
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  try {
    if (url.pathname === '/api/delegate-kpis/import' && request.method === 'POST') {
      const form = await request.formData(), file = form.get('file'), kind = String(form.get('kind') || '') as DelegateKpiKind;
      if (!file || typeof file === 'string' || file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx')) return json({ error: 'Adjunta un Excel XLSX de hasta 20 MB.' }, 400);
      if (!['planning', 'report'].includes(kind)) return json({ error: 'Indica si es planificación o reporte.' }, 400);
      const result = await importDelegateKpiWorkbook(env, await file.arrayBuffer(), file.name, kind, 'web', email);
      return json({ ok: true, import: { id: result.id, kind: result.kind, period: result.period, rows: result.rows.length, delegates: result.delegates, warnings: result.warnings } });
    }
    if (url.pathname === '/api/delegate-kpis/goals' && request.method === 'PUT') return json({ ok: true, goal: await saveGoals(env, await request.json(), email) });
    if (url.pathname === '/api/delegate-kpis' && request.method === 'GET') return json(await delegateKpiDashboard(env, url.searchParams));
    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'No se pudo procesar el seguimiento KPI.' }, 400);
  }
}
