import type { Client } from '../db.js';
import { enqueue } from './outbox.js';
import { assignedEmail, dealClosedEmail, link } from './templates.js';

async function recipient(c: Client, workspaceId: string, userId: string) {
  const r = await c.query(
    `SELECT id, name, email, notifications FROM users WHERE id = $1 AND workspace_id = $2 AND password_hash IS NOT NULL`, [userId, workspaceId]);
  return r.rows[0] as { id: string; name: string; email: string; notifications: { emailUpdates?: boolean } } | undefined;
}

/** "X assigned you a lead/task/deal" - only for real accounts that enabled email updates, never for self-assignment. */
export async function notifyAssigned(c: Client, o: { workspaceId: string; actorId: string; userId: string; what: 'lead' | 'task' | 'deal'; title: string; path: string }) {
  if (o.userId === o.actorId) return;
  const [u, actor] = await Promise.all([recipient(c, o.workspaceId, o.userId), c.query('SELECT name FROM users WHERE id = $1', [o.actorId])]);
  if (!u || !u.notifications?.emailUpdates) return;
  const t = assignedEmail(actor.rows[0]?.name ?? 'A teammate', o.what, o.title, link(o.path));
  await enqueue(c, { workspaceId: o.workspaceId, userId: u.id, createdBy: o.actorId, channel: 'email', kind: `assigned_${o.what}`, to: u.email, subject: t.subject, body: t.text, html: t.html });
}

/** Tells a deal's owner when someone else closes it as won or lost. */
export async function notifyDealClosed(c: Client, o: { workspaceId: string; actorId: string; dealId: string; outcome: 'won' | 'lost' }) {
  const d = await c.query('SELECT owner_id, company, value FROM deals WHERE id = $1', [o.dealId]);
  const deal = d.rows[0];
  if (!deal || deal.owner_id === o.actorId) return;
  const [u, actor] = await Promise.all([recipient(c, o.workspaceId, deal.owner_id), c.query('SELECT name FROM users WHERE id = $1', [o.actorId])]);
  if (!u || !u.notifications?.emailUpdates) return;
  const cur = (await c.query('SELECT currency FROM workspaces WHERE id = $1', [o.workspaceId])).rows[0]?.currency ?? 'USD';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(deal.value);
  const t = dealClosedEmail(actor.rows[0]?.name ?? 'A teammate', o.outcome, deal.company, money, link(`/pipeline?deal=${o.dealId}`));
  await enqueue(c, { workspaceId: o.workspaceId, userId: u.id, createdBy: o.actorId, channel: 'email', kind: `deal_${o.outcome}`, to: u.email, subject: t.subject, body: t.text, html: t.html });
}
