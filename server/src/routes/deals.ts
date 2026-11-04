import { Router } from 'express';
import { requireWrite } from '../auth.js';
import { dealInput, dealPatch, lostInput, reopenInput, stageInput } from '../validation.js';
import { assertMember, buildSet, getDeal, getLead, mutation } from './util.js';
import { logActivity, touchLead } from '../activity.js';
import { notifyAssigned, notifyDealClosed } from '../messaging/notify.js';

export const deals = Router();
deals.use(requireWrite);

const COLS = { title: 'title', company: 'company', value: 'value', ownerId: 'owner_id', priority: 'priority', expectedClose: 'expected_close' };

deals.post('/', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const d = dealInput.parse(req.body);
  await getLead(c, workspaceId, d.leadId);
  await assertMember(c, workspaceId, d.ownerId);
  const r = await c.query(
    `INSERT INTO deals (workspace_id, lead_id, title, company, value, stage, owner_id, priority, expected_close, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $6 = 'Won' THEN now() END) RETURNING id`,
    [workspaceId, d.leadId, d.title, d.company, d.value, d.stage, d.ownerId, d.priority, d.expectedClose],
  );
  await touchLead(c, workspaceId, d.leadId, d.stage);
  await logActivity(c, { workspaceId, actorId: userId, verb: 'created a deal for', subject: d.company, dealId: r.rows[0].id, leadId: d.leadId });
  await notifyAssigned(c, { workspaceId, actorId: userId, userId: d.ownerId, what: 'deal', title: `${d.company} - ${d.title}`, path: `/pipeline?deal=${r.rows[0].id}` });
  return { id: r.rows[0].id };
}, 201));

deals.patch('/:id', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const patch = dealPatch.parse(req.body);
  const prev = await getDeal(c, workspaceId, req.params.id);
  if (patch.ownerId) await assertMember(c, workspaceId, patch.ownerId);
  const { sets, values } = buildSet(patch, COLS, 3);
  // Lost deals keep their stage; reopen them explicitly.
  const stageChanged = !!patch.stage && prev.stage !== 'Lost' && patch.stage !== prev.stage;
  if (stageChanged) {
    values.push(patch.stage); sets.push(`stage = $${values.length + 2}`);
    sets.push(patch.stage === 'Won' ? 'closed_at = now()' : 'closed_at = NULL');
  }
  if (sets.length) await c.query(`UPDATE deals SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, ...values]);
  if (stageChanged) await touchLead(c, workspaceId, prev.lead_id, patch.stage);
  if (patch.ownerId && patch.ownerId !== prev.owner_id) await notifyAssigned(c, { workspaceId, actorId: userId, userId: patch.ownerId, what: 'deal', title: `${prev.company} - ${patch.title ?? prev.title}`, path: `/pipeline?deal=${prev.id}` });
  if (stageChanged && patch.stage === 'Won') await notifyDealClosed(c, { workspaceId, actorId: userId, dealId: prev.id, outcome: 'won' });
  await logActivity(c, {
    workspaceId, actorId: userId, subject: prev.company, dealId: prev.id, leadId: prev.lead_id,
    ...(stageChanged ? { verb: patch.stage === 'Won' ? 'closed' : 'moved', detail: patch.stage === 'Won' ? 'as won' : `to ${patch.stage}` } : { verb: 'updated the deal for' }),
  });
  return { id: prev.id };
}));

deals.post('/:id/move', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const { stage } = stageInput.parse(req.body);
  const prev = await getDeal(c, workspaceId, req.params.id);
  if (prev.stage === stage) return { id: prev.id };
  await c.query(`UPDATE deals SET stage = $3, updated_at = now(), lost_reason = NULL, closed_at = CASE WHEN $3 = 'Won' THEN now() END WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, stage]);
  await touchLead(c, workspaceId, prev.lead_id, stage);
  if (stage === 'Won') await notifyDealClosed(c, { workspaceId, actorId: userId, dealId: prev.id, outcome: 'won' });
  await logActivity(c, { workspaceId, actorId: userId, verb: stage === 'Won' ? 'closed' : 'moved', subject: prev.company, detail: stage === 'Won' ? 'as won' : `to ${stage}`, dealId: prev.id, leadId: prev.lead_id });
  return { id: prev.id };
}));

deals.post('/:id/lost', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const { reason } = lostInput.parse(req.body);
  const prev = await getDeal(c, workspaceId, req.params.id);
  await c.query(`UPDATE deals SET stage = 'Lost', lost_reason = $3, closed_at = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, reason]);
  await touchLead(c, workspaceId, prev.lead_id, 'Lost');
  await notifyDealClosed(c, { workspaceId, actorId: userId, dealId: prev.id, outcome: 'lost' });
  await logActivity(c, { workspaceId, actorId: userId, verb: 'lost', subject: prev.company, detail: 'deal', dealId: prev.id, leadId: prev.lead_id });
  return { id: prev.id };
}));

deals.post('/:id/reopen', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const { stage } = reopenInput.parse(req.body);
  const prev = await getDeal(c, workspaceId, req.params.id);
  await c.query(`UPDATE deals SET stage = $3, lost_reason = NULL, closed_at = NULL, updated_at = now() WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, stage]);
  await touchLead(c, workspaceId, prev.lead_id, stage);
  await logActivity(c, { workspaceId, actorId: userId, verb: 'reopened', subject: prev.company, detail: `in ${stage}`, dealId: prev.id, leadId: prev.lead_id });
  return { id: prev.id };
}));

deals.delete('/:id', mutation(async (c, req) => {
  const prev = await getDeal(c, req.auth.workspaceId, req.params.id);
  await c.query('DELETE FROM deals WHERE id = $1 AND workspace_id = $2', [prev.id, req.auth.workspaceId]);
  return { id: prev.id };
}));
