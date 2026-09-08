export interface PharmacyVisit {
  pharmacy: string;
  date: string;
  address: string;
  classification: string;
  route: string;
  delegate?: string;
  clientId?: string;
  notes?: string;
  time?: string;
  durationMinutes?: number;
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
  const timed=Boolean(visit.time);
  if(timed&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(visit.time!))throw new Error('La hora de visita no es válida.');
  const duration=Number.isInteger(visit.durationMinutes)&&visit.durationMinutes!>=15&&visit.durationMinutes!<=480?visit.durationMinutes!:60;
  const start=timed?`${visit.date}T${visit.time}:00`:visit.date;
  const end=timed?new Date(Date.parse(`${visit.date}T${visit.time}:00Z`)+duration*60000).toISOString().slice(0,19):new Date(day.getTime()+86400000).toISOString().slice(0,10);
  const lines = [
    `Farmacia: ${visit.pharmacy.trim()}`,
    `Clasificación del cliente: ${visit.classification.trim()}`,
    `Ruta: ${visit.route.trim()}`,
    `Dirección: ${visit.address.trim()}`,
    visit.delegate ? `Delegado: ${visit.delegate}` : '',
    visit.clientId ? `VDL: ${visit.clientId}` : '',
    timed ? `Horario: ${visit.time} · ${duration} minutos` : '',
    visit.notes ? `\nObservaciones:\n${visit.notes}` : '',
  ].filter(Boolean);
  return { summary: `Visita · ${visit.pharmacy.trim()}`, start, end, location: visit.address.trim(), description: lines.join('\n'), calendar_id: calendarId };
}
