import type { Client } from './db.js';

export interface ActivityInput {
  workspaceId: string; actorId: string; verb: string; subject: string; detail?: string;
  leadId?: string | null; dealId?: string | null; taskId?: string | null;
}

export async function logActivity(c: Client, a: ActivityInput) {
  await c.query(
    'INSERT INTO activities (workspace_id, actor_id, verb, subject, detail, lead_id, deal_id, task_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [a.workspaceId, a.actorId, a.verb, a.subject, a.detail ?? null, a.leadId ?? null, a.dealId ?? null, a.taskId ?? null],
  );
}

/** Marks a lead as touched now (bumps last-activity), optionally patching its status. */
export async function touchLead(c: Client, workspaceId: string, leadId: string, status?: string) {
  await c.query(
    `UPDATE leads SET updated_at = now(), last_activity_at = now(), status = COALESCE($3, status) WHERE id = $1 AND workspace_id = $2`,
    [leadId, workspaceId, status ?? null],
  );
}
