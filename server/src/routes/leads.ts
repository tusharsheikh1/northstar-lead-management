import { Router } from 'express';
import { requireWrite } from '../auth.js';
import { HttpError } from '../http.js';
import { leadInput, withLeadDefaults, leadPatch, leadBulk, idList, leadImport, noteInput } from '../validation.js';
import { assertMember, buildSet, getLead, mutation } from './util.js';
import { logActivity, touchLead } from '../activity.js';

export const leads = Router();
leads.use(requireWrite);

const COLS = { name: 'name', company: 'company', email: 'email', phone: 'phone', status: 'status', ownerId: 'owner_id', source: 'source', value: 'value', notes: 'notes' };

leads.post('/', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const d = withLeadDefaults(leadInput.parse(req.body));
  await assertMember(c, workspaceId, d.ownerId);
  const r = await c.query(
    `INSERT INTO leads (workspace_id, name, company, email, phone, status, owner_id, source, value, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [workspaceId, d.name, d.company, d.email, d.phone, d.status, d.ownerId, d.source, d.value, d.notes],
  );
  await logActivity(c, { workspaceId, actorId: userId, verb: 'added', subject: d.name, detail: 'as a new lead', leadId: r.rows[0].id });
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
      `INSERT INTO leads (workspace_id, name, company, email, phone, status, owner_id, source, value, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [workspaceId, d.name, d.company, d.email, d.phone, d.status, d.ownerId, d.source, d.value, d.notes],
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
