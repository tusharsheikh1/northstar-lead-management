import { Router } from 'express';
import { requireWrite, type AuthedRequest } from '../auth.js';
import { pool } from '../db.js';
import { ah } from '../http.js';
import { HttpError } from '../http.js';
import { leadInput, withLeadDefaults, leadPatch, leadBulk, idList, leadImport, noteInput, leadEmailInput, leadSmsInput } from '../validation.js';
import { emailMode } from '../messaging/mailer.js';
import { smsMode, MAX_SMS_CHARS } from '../messaging/sms.js';
import { BD_PHONE_HINT, normalizeBdMobile } from '../messaging/phone.js';
import { enqueue } from '../messaging/outbox.js';
import { notifyAssigned } from '../messaging/notify.js';
import { leadEmailHtml } from '../messaging/templates.js';
import { assertMember, buildSet, getLead, mutation } from './util.js';
import { logActivity, touchLead } from '../activity.js';

export const leads = Router();

// Message history is visible to every role (including Viewers).
leads.get('/:id/messages', ah<AuthedRequest>(async (req, res) => {
  const r = await pool.query(
    `SELECT m.id, m.channel, m.kind, m.to_address, m.subject, m.body, m.status, m.error, m.created_at, m.sent_at, u.name AS sender
       FROM messages m LEFT JOIN users u ON u.id = m.created_by WHERE m.workspace_id = $1 AND m.lead_id = $2 ORDER BY m.created_at DESC LIMIT 50`, [req.auth.workspaceId, req.params.id]);
  res.json({ messages: r.rows.map((m) => ({ id: m.id, channel: m.channel, to: m.to_address, subject: m.subject, body: m.body, status: m.status, error: m.error, sender: m.sender, createdAt: m.created_at, sentAt: m.sent_at })) });
}));

leads.use(requireWrite);

const COLS = { name: 'name', company: 'company', email: 'email', phone: 'phone', status: 'status', ownerId: 'owner_id', source: 'source', value: 'value', notes: 'notes', doNotContact: 'do_not_contact' };

leads.post('/', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const d = withLeadDefaults(leadInput.parse(req.body));
  await assertMember(c, workspaceId, d.ownerId);
  const r = await c.query(
    `INSERT INTO leads (workspace_id, name, company, email, phone, status, owner_id, source, value, notes, do_not_contact) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [workspaceId, d.name, d.company, d.email, d.phone, d.status, d.ownerId, d.source, d.value, d.notes, d.doNotContact],
  );
  await logActivity(c, { workspaceId, actorId: userId, verb: 'added', subject: d.name, detail: 'as a new lead', leadId: r.rows[0].id });
  await notifyAssigned(c, { workspaceId, actorId: userId, userId: d.ownerId, what: 'lead', title: `${d.name} (${d.company})`, path: `/leads?lead=${r.rows[0].id}` });
  return { id: r.rows[0].id };
}, 201));

leads.post('/import', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const rows = leadImport.parse(req.body).leads.map(withLeadDefaults);
  const owners = new Set(rows.map((r) => r.ownerId));
  for (const o of owners) await assertMember(c, workspaceId, o);
  const existing = new Set((await c.query(`SELECT lower(email) e FROM leads WHERE workspace_id = $1 AND email <> ''`, [workspaceId])).rows.map((r) => r.e));
  let imported = 0; let skipped = 0;
  for (const d of rows) {
    const key = d.email.toLowerCase();
    if (key && existing.has(key)) { skipped++; continue; }
    if (key) existing.add(key);
    await c.query(
      `INSERT INTO leads (workspace_id, name, company, email, phone, status, owner_id, source, value, notes, do_not_contact) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [workspaceId, d.name, d.company, d.email, d.phone, d.status, d.ownerId, d.source, d.value, d.notes, d.doNotContact],
    );
    imported++;
  }
  if (imported) await logActivity(c, { workspaceId, actorId: userId, verb: 'imported', subject: `${imported} leads`, detail: 'from CSV' });
  return { imported, skipped };
}, 201));

leads.patch('/bulk', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const { ids, patch } = leadBulk.parse(req.body);
  if (patch.ownerId) await assertMember(c, workspaceId, patch.ownerId);
  const { sets, values } = buildSet(patch, { ownerId: 'owner_id', status: 'status' }, 3);
  const r = await c.query(`UPDATE leads SET ${sets.join(', ')}, updated_at = now(), last_activity_at = now() WHERE workspace_id = $1 AND id = ANY($2::uuid[]) RETURNING id`, [workspaceId, ids, ...values]);
  if (!r.rowCount) throw new HttpError(404, 'No matching leads found.');
  const who = patch.ownerId ? (await c.query('SELECT name FROM users WHERE id = $1', [patch.ownerId])).rows[0].name : '';
  if (patch.ownerId && r.rowCount) await notifyAssigned(c, { workspaceId, actorId: userId, userId: patch.ownerId, what: 'lead', title: r.rowCount === 1 ? 'a lead' : `${r.rowCount} leads`, path: '/leads' });
  await logActivity(c, { workspaceId, actorId: userId, verb: 'updated', subject: `${r.rowCount} leads`, detail: patch.status ? `to ${patch.status}` : `owner to ${who}` });
  return { updated: r.rowCount };
}));

leads.post('/bulk-delete', mutation(async (c, req) => {
  const { ids } = idList.parse(req.body);
  const r = await c.query('DELETE FROM leads WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [req.auth.workspaceId, ids]);
  return { deleted: r.rowCount };
}));

leads.patch('/:id', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const patch = leadPatch.parse(req.body);
  const prev = await getLead(c, workspaceId, req.params.id);
  if (patch.ownerId) await assertMember(c, workspaceId, patch.ownerId);
  const { sets, values } = buildSet(patch, COLS, 3);
  if (sets.length) await c.query(`UPDATE leads SET ${sets.join(', ')}, updated_at = now(), last_activity_at = now() WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, ...values]);
  if (patch.company) await c.query('UPDATE deals SET company = $3 WHERE lead_id = $1 AND workspace_id = $2', [prev.id, workspaceId, patch.company]);
  if (patch.ownerId && patch.ownerId !== prev.owner_id) await notifyAssigned(c, { workspaceId, actorId: userId, userId: patch.ownerId, what: 'lead', title: `${patch.name ?? prev.name} (${patch.company ?? prev.company})`, path: `/leads?lead=${prev.id}` });
  const moved = patch.status && patch.status !== prev.status;
  await logActivity(c, {
    workspaceId, actorId: userId, leadId: prev.id, subject: patch.name ?? prev.name,
    ...(moved ? { verb: 'moved', detail: `to ${patch.status}` } : { verb: 'updated' }),
  });
  return { id: prev.id };
}));

leads.post('/:id/notes', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const lead = await getLead(c, workspaceId, req.params.id);
  const { body } = noteInput.parse(req.body);
  const r = await c.query('INSERT INTO notes (workspace_id, lead_id, body, author_id) VALUES ($1,$2,$3,$4) RETURNING id', [workspaceId, lead.id, body, userId]);
  await touchLead(c, workspaceId, lead.id);
  await logActivity(c, { workspaceId, actorId: userId, verb: 'added a note to', subject: lead.name, leadId: lead.id });
  return { id: r.rows[0].id };
}, 201));

// ---- Sending messages to a lead -----------------------------------------------------------------
// Messages are queued and delivered by the background worker; their status shows in the lead's message history.
leads.post('/:id/email', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const lead = await getLead(c, workspaceId, req.params.id);
  const d = leadEmailInput.parse(req.body);
  if (emailMode() === 'none') throw new HttpError(400, 'Email delivery is not configured on this server.');
  if (lead.do_not_contact) throw new HttpError(400, `${lead.name} is marked “Do not contact”.`);
  if (!lead.email) throw new HttpError(400, `${lead.name} has no email address.`);
  const sender = (await c.query('SELECT name FROM users WHERE id = $1', [userId])).rows[0].name;
  const id = await enqueue(c, { workspaceId, leadId: lead.id, createdBy: userId, channel: 'email', kind: 'lead_email', to: lead.email, subject: d.subject, body: `${d.body}\n\n-- Sent by ${sender} via Northstar CRM`, html: leadEmailHtml(d.body, sender) });
  await touchLead(c, workspaceId, lead.id);
  await logActivity(c, { workspaceId, actorId: userId, verb: 'emailed', subject: lead.name, leadId: lead.id });
  return { id };
}, 201));

leads.post('/:id/sms', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const lead = await getLead(c, workspaceId, req.params.id);
  const { message } = leadSmsInput.parse(req.body);
  if (message.length > MAX_SMS_CHARS) throw new HttpError(400, `SMS is limited to ${MAX_SMS_CHARS} characters.`);
  if (smsMode() === 'none') throw new HttpError(400, 'SMS delivery is not configured on this server.');
  if (lead.do_not_contact) throw new HttpError(400, `${lead.name} is marked “Do not contact”.`);
  const to = normalizeBdMobile(lead.phone);
  if (!to) throw new HttpError(400, `${lead.name}'s phone number is not a Bangladeshi mobile number. ${BD_PHONE_HINT}`);
  const id = await enqueue(c, { workspaceId, leadId: lead.id, createdBy: userId, channel: 'sms', kind: 'lead_sms', to: `+${to}`, body: message });
  await touchLead(c, workspaceId, lead.id);
  await logActivity(c, { workspaceId, actorId: userId, verb: 'sent an SMS to', subject: lead.name, leadId: lead.id });
  return { id };
}, 201));
