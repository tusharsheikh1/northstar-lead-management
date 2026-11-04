import type { Database } from '../../src/types.js';
import { pool, type Queryable } from './db.js';

export const DB_VERSION = 2;

/** The whole workspace as the frontend consumes it. Sizes are small enough to send in one response. */
export async function snapshot(workspaceId: string, userId: string, q: Queryable = pool): Promise<Database> {
  const [ws, users, leads, deals, tasks, notes, acts] = await Promise.all([
    q.query('SELECT * FROM workspaces WHERE id = $1', [workspaceId]),
    q.query('SELECT * FROM users WHERE workspace_id = $1 ORDER BY created_at, name', [workspaceId]),
    q.query('SELECT * FROM leads WHERE workspace_id = $1 ORDER BY last_activity_at DESC', [workspaceId]),
    q.query('SELECT * FROM deals WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]),
    q.query('SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY due_at', [workspaceId]),
    q.query('SELECT * FROM notes WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]),
    q.query('SELECT * FROM activities WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 500', [workspaceId]),
  ]);
  const w = ws.rows[0];
  const me = users.rows.find((u) => u.id === userId);
  return {
    version: DB_VERSION,
    owners: users.rows.map((u) => ({ id: u.id, name: u.name, email: u.email, jobTitle: u.job_title, role: u.role, color: u.color, photo: u.photo ?? undefined, canSignIn: u.password_hash !== null })),
    leads: leads.rows.map((r) => ({ id: r.id, name: r.name, company: r.company, email: r.email, phone: r.phone, status: r.status, ownerId: r.owner_id, source: r.source, value: r.value, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at, lastActivityAt: r.last_activity_at })),
    deals: deals.rows.map((r) => ({ id: r.id, leadId: r.lead_id, title: r.title, company: r.company, value: r.value, stage: r.stage, ownerId: r.owner_id, priority: r.priority, expectedClose: r.expected_close, lostReason: r.lost_reason ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at, closedAt: r.closed_at ?? undefined })),
    tasks: tasks.rows.map((r) => ({ id: r.id, title: r.title, leadId: r.lead_id ?? undefined, dealId: r.deal_id ?? undefined, ownerId: r.owner_id, assignedById: r.assigned_by_id, dueAt: r.due_at, priority: r.priority, completed: r.completed, completedAt: r.completed_at ?? undefined, createdAt: r.created_at })),
    notes: notes.rows.map((r) => ({ id: r.id, leadId: r.lead_id, body: r.body, authorId: r.author_id, createdAt: r.created_at })),
    activities: acts.rows.map((r) => ({ id: r.id, actorId: r.actor_id, verb: r.verb, subject: r.subject, detail: r.detail ?? undefined, leadId: r.lead_id ?? undefined, dealId: r.deal_id ?? undefined, taskId: r.task_id ?? undefined, createdAt: r.created_at })),
    settings: {
      currentUserId: userId,
      workspace: { name: w.name, currency: w.currency, language: w.language, timeZone: w.time_zone, dateFormat: w.date_format, monthlyTarget: w.monthly_target, isDemo: w.is_demo },
      probabilities: w.probabilities,
      notifications: me?.notifications ?? { emailUpdates: true, taskReminders: true, weeklySummary: false },
    },
  } as Database;
}
