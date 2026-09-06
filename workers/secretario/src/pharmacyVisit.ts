export interface PharmacyVisit {
  pharmacy: string;
  date: string;
  address: string;
  classification: string;
  route: string;
  delegate?: string;
  clientId?: string;
  notes?: string;
}

/** Build from resolved Excel/CRM data, without guessing missing client fields. */
export function pharmacyVisitEvent(visit: PharmacyVisit, calendarId: string) {
  for (const [key, label] of Object.entries({ pharmacy: 'farmacia', address: 'dirección', classification: 'clasificación del cliente', route: 'ruta' })) {
    const value = visit[key as keyof PharmacyVisit];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${label} en los datos de la visita. Completa el Excel o el CRM antes de crear el evento.`);
  }
  const day = new Date(`${visit.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== visit.date) throw new Error('La fecha de visita no es válida.');
  if (!calendarId) throw new Error('Falta el calendario Planificación.');
  const end = new Date(day.getTime() + 86400000).toISOString().slice(0,10);
  const lines = [
    `Farmacia: ${visit.pharmacy.trim()}`,
    `Clasificación del cliente: ${visit.classification.trim()}`,
    `Ruta: ${visit.route.trim()}`,
    `Dirección: ${visit.address.trim()}`,
    visit.delegate ? `Delegado: ${visit.delegate}` : '',
    visit.clientId ? `VDL: ${visit.clientId}` : '',
    visit.notes ? `\nObservaciones:\n${visit.notes}` : '',
  ].filter(Boolean);
  return { summary: `Visita · ${visit.pharmacy.trim()}`, start: visit.date, end, location: visit.address.trim(), description: lines.join('\n'), calendar_id: calendarId };
}
