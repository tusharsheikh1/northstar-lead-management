import { randomUUID } from 'node:crypto';
import type { Client } from '../db.js';
import { buildSeed, OWNERS } from './sampleData.js';

/**
 * Replaces the workspace's leads/deals/tasks/notes/activities with realistic sample data.
 * Sample teammates are created without passwords, so they appear in the team but cannot sign in.
 * Seed owner "u1" (Maya Chen) is mapped to the real signed-in user.
 */
export async function loadSampleData(c: Client, workspaceId: string, currentUserId: string) {
  for (const t of ['activities', 'notes', 'tasks', 'deals', 'leads']) {
    await c.query(`DELETE FROM ${t} WHERE workspace_id = $1`, [workspaceId]);
  }
  const seed = buildSeed();
  const ids = new Map<string, string>([['u1', currentUserId]]);
  for (const o of OWNERS.filter((x) => x.id !== 'u1')) {
    const existing = await c.query('SELECT id FROM users WHERE workspace_id = $1 AND lower(email) = lower($2)', [workspaceId, o.email]);
    if (existing.rows[0]) { ids.set(o.id, existing.rows[0].id); continue; }
    const r = await c.query(
      'INSERT INTO users (workspace_id, name, email, job_title, role, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [workspaceId, o.name, o.email, o.jobTitle, o.role, o.color],
    );
    ids.set(o.id, r.rows[0].id);
  }
  const map = (k: string) => { if (!ids.has(k)) ids.set(k, randomUUID()); return ids.get(k)!; };
  const opt = (k?: string) => (k ? map(k) : null);

  for (const l of seed.leads) {
    await c.query(
      `INSERT INTO leads (id, workspace_id, name, company, email, phone, status, owner_id, source, value, notes, created_at, updated_at, last_activity_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [map(l.id), workspaceId, l.name, l.company, l.email, l.phone, l.status, map(l.ownerId), l.source, l.value, l.notes, l.createdAt, l.updatedAt, l.lastActivityAt],
    );
  }
  for (const d of seed.deals) {
    await c.query(
      `INSERT INTO deals (id, workspace_id, lead_id, title, company, value, stage, owner_id, priority, expected_close, lost_reason, created_at, updated_at, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [map(d.id), workspaceId, map(d.leadId), d.title, d.company, d.value, d.stage, map(d.ownerId), d.priority, d.expectedClose, d.lostReason ?? null, d.createdAt, d.updatedAt, d.closedAt ?? null],
    );
  }
  for (const t of seed.tasks) {
    await c.query(
      `INSERT INTO tasks (id, workspace_id, title, lead_id, deal_id, owner_id, assigned_by_id, due_at, priority, completed, completed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [map(t.id), workspaceId, t.title, opt(t.leadId), opt(t.dealId), map(t.ownerId), map(t.assignedById), t.dueAt, t.priority, t.completed, t.completedAt ?? null, t.createdAt],
    );
  }
  for (const n of seed.notes) {
    await c.query('INSERT INTO notes (id, workspace_id, lead_id, body, author_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [map(n.id), workspaceId, map(n.leadId), n.body, map(n.authorId), n.createdAt]);
  }
  for (const a of seed.activities) {
    await c.query(
      `INSERT INTO activities (id, workspace_id, actor_id, verb, subject, detail, lead_id, deal_id, task_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), workspaceId, map(a.actorId), a.verb, a.subject, a.detail ?? null, opt(a.leadId), opt(a.dealId), opt(a.taskId), a.createdAt],
    );
  }
  await c.query('UPDATE workspaces SET is_demo = true, monthly_target = $2, probabilities = $3 WHERE id = $1', [workspaceId, seed.settings.workspace.monthlyTarget, JSON.stringify(seed.settings.probabilities)]);
}
