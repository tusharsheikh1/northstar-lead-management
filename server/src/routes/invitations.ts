import { Router } from 'express';
import { requireAdmin, type AuthedRequest } from '../auth.js';
import { pool, withTransaction } from '../db.js';
import { ah, HttpError, notFound } from '../http.js';
import { invitationInput } from '../validation.js';
import { newToken } from '../tokens.js';
import { enqueue, dispatchSoon } from '../messaging/outbox.js';
import { emailMode } from '../messaging/mailer.js';
import { inviteEmail, link } from '../messaging/templates.js';

export const invitations = Router();
invitations.use(requireAdmin);

const DAYS = 7;

invitations.get('/', ah<AuthedRequest>(async (req, res) => {
  const r = await pool.query(
    `SELECT i.id, i.email, i.role, i.created_at, i.expires_at, u.name AS invited_by
       FROM invitations i LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`, [req.auth.workspaceId]);
  res.json({ invitations: r.rows.map((x) => ({ id: x.id, email: x.email, role: x.role, createdAt: x.created_at, expiresAt: x.expires_at, invitedBy: x.invited_by })) });
}));

invitations.post('/', ah<AuthedRequest>(async (req, res) => {
  const { workspaceId, userId } = req.auth;
  const d = invitationInput.parse(req.body);
  const email = d.email.toLowerCase();
  const out = await withTransaction(async (c) => {
    const member = await c.query('SELECT 1 FROM users WHERE workspace_id = $1 AND lower(email) = $2 AND password_hash IS NOT NULL', [workspaceId, email]);
    if (member.rowCount) throw new HttpError(409, 'That person is already on your team.', { email: 'Already on your team.' });
    const elsewhere = await c.query('SELECT 1 FROM users WHERE lower(email) = $1 AND password_hash IS NOT NULL', [email]);
    if (elsewhere.rowCount) throw new HttpError(409, 'That email already has an account in another workspace.', { email: 'Already has an account.' });
    await c.query('UPDATE invitations SET revoked_at = now() WHERE workspace_id = $1 AND lower(email) = $2 AND accepted_at IS NULL AND revoked_at IS NULL', [workspaceId, email]);
    const { token, hash } = newToken();
    const inv = await c.query(
      `INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval) RETURNING id, expires_at`,
      [workspaceId, email, d.role, hash, userId, String(DAYS)]);
    const [who, ws] = await Promise.all([c.query('SELECT name FROM users WHERE id = $1', [userId]), c.query('SELECT name FROM workspaces WHERE id = $1', [workspaceId])]);
    const url = link(`/accept-invite?token=${token}`);
    const m = inviteEmail(who.rows[0].name, ws.rows[0].name, d.role, url);
    await enqueue(c, { workspaceId, createdBy: userId, channel: 'email', kind: 'invite', to: email, subject: m.subject, body: m.text, html: m.html });
    return { id: inv.rows[0].id as string, expiresAt: inv.rows[0].expires_at as string, link: url };
  });
  dispatchSoon();
  // The link is returned so the admin can share it themselves when email is not configured.
  res.status(201).json({ invitation: out, emailMode: emailMode() });
}));

invitations.delete('/:id', ah<AuthedRequest>(async (req, res) => {
  const r = await pool.query('UPDATE invitations SET revoked_at = now() WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL', [req.params.id, req.auth.workspaceId]);
  if (!r.rowCount) throw notFound('Invitation');
  res.json({ ok: true });
}));
