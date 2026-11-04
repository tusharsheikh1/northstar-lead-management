import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../auth.js';
import { HttpError } from '../http.js';
import { memberInput, notificationsPatch, profilePatch, rolePatch, workspacePatch } from '../validation.js';
import { buildSet, mutation } from './util.js';
import { loadSampleData } from '../seed/load.js';

export const account = Router();

// Own profile - any role may edit their own profile and preferences.
account.patch('/me', mutation(async (c, req) => {
  const p = profilePatch.parse(req.body);
  const { sets, values } = buildSet(p, { name: 'name', email: 'email', jobTitle: 'job_title', photo: 'photo' }, 2);
  if (sets.length) await c.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, [req.auth.userId, ...values]);
  return { ok: true };
}));

account.patch('/me/notifications', mutation(async (c, req) => {
  const p = notificationsPatch.parse(req.body);
  await c.query('UPDATE users SET notifications = notifications || $2::jsonb WHERE id = $1', [req.auth.userId, JSON.stringify(p)]);
  return { ok: true };
}));

// Team management - admins only. No email is sent: the admin sets an initial password and shares it themselves.
account.post('/users', requireAdmin, mutation(async (c, req) => {
  const d = memberInput.parse(req.body);
  const taken = await c.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [d.email]);
  if (taken.rowCount) throw new HttpError(409, 'An account with that email already exists.', { email: 'An account with that email already exists.' });
  const r = await c.query(
    'INSERT INTO users (workspace_id, name, email, password_hash, job_title, role) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.auth.workspaceId, d.name, d.email, await bcrypt.hash(d.password, 10), d.jobTitle, d.role],
  );
  return { id: r.rows[0].id };
}, 201));

account.patch('/users/:id/role', requireAdmin, mutation(async (c, req) => {
  const { role } = rolePatch.parse(req.body);
  if (req.params.id === req.auth.userId) throw new HttpError(400, 'You cannot change your own role.');
  const r = await c.query('UPDATE users SET role = $3 WHERE id = $1 AND workspace_id = $2', [req.params.id, req.auth.workspaceId, role]);
  if (!r.rowCount) throw new HttpError(404, 'Team member not found.');
  return { ok: true };
}));

// Workspace settings - admins only.
account.patch('/workspace', requireAdmin, mutation(async (c, req) => {
  const { probabilities, ...rest } = workspacePatch.parse(req.body);
  const { sets, values } = buildSet(rest, { name: 'name', currency: 'currency', language: 'language', timeZone: 'time_zone', dateFormat: 'date_format', monthlyTarget: 'monthly_target' }, 2);
  if (probabilities) { values.push(JSON.stringify(probabilities)); sets.push(`probabilities = probabilities || $${values.length + 1}::jsonb`); }
  if (sets.length) await c.query(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = $1`, [req.auth.workspaceId, ...values]);
  return { ok: true };
}));

account.post('/workspace/sample-data', requireAdmin, mutation(async (c, req) => {
  await loadSampleData(c, req.auth.workspaceId, req.auth.userId);
  return { ok: true };
}));

account.delete('/workspace/data', requireAdmin, mutation(async (c, req) => {
  for (const t of ['activities', 'notes', 'tasks', 'deals', 'leads']) await c.query(`DELETE FROM ${t} WHERE workspace_id = $1`, [req.auth.workspaceId]);
  await c.query('UPDATE workspaces SET is_demo = false WHERE id = $1', [req.auth.workspaceId]);
  return { ok: true };
}));

