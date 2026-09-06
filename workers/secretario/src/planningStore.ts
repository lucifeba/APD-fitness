import type { Env } from './env';
import { proposeAccompaniments, type PlanningInput } from './planning';

export async function saveProposal(env: Env, input: PlanningInput, email: string) {
  const proposal = proposeAccompaniments(input);
  if (!proposal.selected.length) throw new Error('No hay días válidos para proponer. Revisa las rutas y la zona de referencia.');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO planning_proposals(id,month,proposal,created_by,created_at) VALUES(?,?,?,?,?)')
    .bind(id, input.month, JSON.stringify(proposal), email, new Date().toISOString()).run();
  return { id, ...proposal };
}

export async function decideProposal(env: Env, id: string, decision: 'approved' | 'cancelled', email: string) {
  // Only the owner can approve their schedule. An administrator token is not an owner session.
  if (email.trim().toLowerCase() !== env.OWNER_EMAIL?.trim().toLowerCase()) throw new Error('Solo la propietaria puede decidir su planificación.');
  const result = await env.DB.prepare("UPDATE planning_proposals SET status=?,decided_by=?,decided_at=? WHERE id=? AND status='pending_approval'")
    .bind(decision, email, new Date().toISOString(), id).run();
  if (result.meta.changes !== 1) throw new Error('La propuesta no existe o ya ha sido aprobada o cancelada.');
  return { id, status: decision, calendarEventsCreated: 0 };
}

export async function listProposals(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM planning_proposals ORDER BY created_at DESC LIMIT 24').all<{id:string;month:string;proposal:string;status:string;created_at:string;decided_at:string|null}>();
  return rows.results.map(({ proposal, ...row }) => ({ ...row, proposal: JSON.parse(proposal) }));
}
