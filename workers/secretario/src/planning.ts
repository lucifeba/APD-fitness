/** Deterministic accompaniment proposals. Never writes calendars. */
export type Region = 'Madrid' | 'Aragón';
export interface PlanningPharmacy { name:string; address:string; classification:string; clientId?:string; notes?:string }
export interface RouteDay {
  date: string;
  delegate: string;
  region: Region;
  route: string;
  pharmacies: (string|PlanningPharmacy)[];
}
export interface PlanningInput {
  month: string;
  anchorMonday: string;
  anchorRegion: Region;
  routes: RouteDay[];
  history: RouteDay[];
}
const DAY = 86400000;
export const pharmacyName=(p:string|PlanningPharmacy)=>typeof p==='string'?p:p.name;
function dateMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida: usa YYYY-MM-DD.');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Fecha inexistente.');
  return ms;
}
export function proposeAccompaniments(input: PlanningInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Mes inválido.');
  const anchor = dateMs(input.anchorMonday);
  if (new Date(anchor).getUTCDay() !== 1) throw new Error('La fecha de referencia debe ser un lunes.');
  if (!['Madrid', 'Aragón'].includes(input.anchorRegion)) throw new Error('Zona de referencia inválida.');
  if (!Array.isArray(input.routes) || !Array.isArray(input.history) || input.routes.length > 5000 || input.history.length > 5000) throw new Error('Listado de rutas inválido.');
  for (const row of [...input.routes, ...input.history]) {
    dateMs(row.date);
    if (!row.delegate?.trim() || !row.route?.trim() || !['Madrid', 'Aragón'].includes(row.region) || !Array.isArray(row.pharmacies) || !row.pharmacies.length || row.pharmacies.some(p => !pharmacyName(p)?.trim())) throw new Error('Cada ruta necesita fecha, delegado, zona y farmacias.');
  }
  const history = input.history.filter(r => r.date < `${input.month}-01`);
  const selected: RouteDay[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  const count = (delegate: string) => selected.filter(r => r.delegate === delegate).length;
  const score = (r: RouteDay) => {
    const prior = [...history, ...selected].filter(h => h.delegate === r.delegate);
    const clients = new Set(prior.flatMap(h => h.pharmacies.map(pharmacyName)));
    return count(r.delegate) * 10000 + prior.filter(h => h.route === r.route).length * 100 + r.pharmacies.filter(p => clients.has(pharmacyName(p))).length;
  };
  for (let ms = dateMs(`${input.month}-01`); new Date(ms).toISOString().startsWith(input.month); ms += DAY) {
    const day = new Date(ms);
    if (![2, 3, 4].includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    const week = Math.floor((ms - anchor) / (7 * DAY));
    const region = ((week % 2) + 2) % 2 === 0 ? input.anchorRegion : input.anchorRegion === 'Madrid' ? 'Aragón' : 'Madrid';
    const options = input.routes.filter(r => r.date === date && r.region === region).sort((a,b) => score(a) - score(b) || a.delegate.localeCompare(b.delegate) || a.route.localeCompare(b.route));
    if (!options.length) { missing.push(`${date} · ${region}: no hay ruta de origen disponible`); continue; }
    selected.push(options[0]);
    reasons.push(`${date}: equilibrio entre delegados y menor repetición de rutas y farmacias dentro de la planificación disponible.`);
  }
  return { status: 'pending_approval', selected, missing, reasons, flexible: false, calendarEventsCreated: 0 };
}
