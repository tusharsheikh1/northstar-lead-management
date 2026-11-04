import { Router } from 'express';
import { requireWrite } from '../auth.js';
import { HttpError, notFound } from '../http.js';
import { completeInput, taskInput, taskPatch } from '../validation.js';
import type { Client } from '../db.js';
import { assertMember, buildSet, getLead, mutation } from './util.js';
import { logActivity } from '../activity.js';

export const tasks = Router();
tasks.use(requireWrite);

const COLS = { title: 'title', leadId: 'lead_id', dealId: 'deal_id', ownerId: 'owner_id', dueAt: 'due_at', priority: 'priority' };

async function checkLinks(c: Client, workspaceId: string, leadId?: string | null, dealId?: string | null) {
  if (leadId) await getLead(c, workspaceId, leadId);
  if (dealId) {
    const r = await c.query('SELECT lead_id FROM deals WHERE id = $1 AND workspace_id = $2', [dealId, workspaceId]);
    if (!r.rows[0]) throw new HttpError(400, 'Related deal not found.');
    if (leadId && r.rows[0].lead_id !== leadId) throw new HttpError(400, 'That deal does not belong to the selected lead.');
  }
}

async function getTask(c: Client, workspaceId: string, id: string) {
  const r = await c.query('SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  if (!r.rows[0]) throw notFound('Task');
  return r.rows[0];
}

tasks.post('/', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const d = taskInput.parse(req.body);
  await assertMember(c, workspaceId, d.ownerId);
  await checkLinks(c, workspaceId, d.leadId, d.dealId);
  const r = await c.query(
    'INSERT INTO tasks (workspace_id, title, lead_id, deal_id, owner_id, assigned_by_id, due_at, priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [workspaceId, d.title, d.leadId ?? null, d.dealId ?? null, d.ownerId, userId, d.dueAt, d.priority],
  );
  await logActivity(c, { workspaceId, actorId: userId, verb: 'created task', subject: d.title, taskId: r.rows[0].id, leadId: d.leadId });
  return { id: r.rows[0].id };
}, 201));

tasks.patch('/:id', mutation(async (c, req) => {
  const { workspaceId } = req.auth;
  const patch = taskPatch.parse(req.body);
  const prev = await getTask(c, workspaceId, req.params.id);
  if (patch.ownerId) await assertMember(c, workspaceId, patch.ownerId);
  await checkLinks(c, workspaceId, 'leadId' in patch ? patch.leadId : prev.lead_id, 'dealId' in patch ? patch.dealId : prev.deal_id);
  const { sets, values } = buildSet(patch, COLS, 3);
  if (sets.length) await c.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1 AND workspace_id = $2`, [prev.id, workspaceId, ...values]);
  return { id: prev.id };
}));

tasks.post('/:id/complete', mutation(async (c, req) => {
  const { workspaceId, userId } = req.auth;
  const { completed } = completeInput.parse(req.body);
  const prev = await getTask(c, workspaceId, req.params.id);
  await c.query('UPDATE tasks SET completed = $3, completed_at = CASE WHEN $3 THEN now() END WHERE id = $1 AND workspace_id = $2', [prev.id, workspaceId, completed]);
  if (completed && !prev.completed) await logActivity(c, { workspaceId, actorId: userId, verb: 'completed task', subject: prev.title, taskId: prev.id, leadId: prev.lead_id });
  return { id: prev.id };
}));

tasks.delete('/:id', mutation(async (c, req) => {
  const prev = await getTask(c, req.auth.workspaceId, req.params.id);
  await c.query('DELETE FROM tasks WHERE id = $1 AND workspace_id = $2', [prev.id, req.auth.workspaceId]);
  return { id: prev.id };
}));
