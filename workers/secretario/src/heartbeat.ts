import type { Env } from './env';
import { receipt } from './db';
import { gmailSearch, googleConfigured } from './google';
import { ask } from './router';
import { clip, safeJson } from './util';

/** Revisión proactiva: correos que merecen aviso y eventos próximos. Devuelve el texto a enviar o null. */
export async function heartbeat(env: Env, ownerName: string): Promise<string | null> {
  if (!(await googleConfigured(env))) return null;
  const alerts: string[] = [];

  try {
    const mails = await gmailSearch(env, 'is:unread newer_than:2h in:inbox -category:promotions -category:social -category:updates -category:forums', 15);
    const fresh = [];
    for (const m of mails) if (await receipt(env, `mail:${m.id}`)) fresh.push(m);
    if (fresh.length) {
      const out = await ask(
        env,
        'fast',
        `Eres el filtro de correo de ${ownerName}, entrenador y consultor. Devuelve SOLO JSON {"alerts":[{"id":"...","why":"..."}]} con los correos que exigen atención hoy: clientes, atletas, socios, facturas, plazos, citas. Ignora newsletters, marketing, notificaciones automáticas y cursos. Máximo 4. Si ninguno, {"alerts":[]}.`,
        fresh.map((m) => `id=${m.id} | de: ${m.from} | asunto: ${m.subject} | ${clip(m.snippet, 160)}`).join('\n'),
        400,
      );
      const parsed = safeJson<{ alerts?: { id: string; why: string }[] }>(out, { alerts: [] });
      for (const a of parsed.alerts ?? []) {
        const m = fresh.find((x) => x.id === a.id);
        if (m) alerts.push(`✉️ **${m.subject}** de ${m.from.replace(/<.*>/, '').trim()}. ${a.why}`);
      }
    }
  } catch (e: any) {
    console.warn('heartbeat correo', e?.message);
  }

  // Los avisos de eventos y tareas los programa reminders.ts con alarmas exactas (REMIND_MINUTES antes).
  return alerts.length ? alerts.join('\n') : null;
}
