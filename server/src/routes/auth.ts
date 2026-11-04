import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { COOKIE, requireAuth, setSessionCookie, type AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { ah, HttpError } from '../http.js';
import { acceptInviteInput, forgotInput, loginInput, passwordInput, registerInput, resetInput } from '../validation.js';
import { hashToken, newToken } from '../tokens.js';
import { dispatchSoon, enqueue } from '../messaging/outbox.js';
import { link, passwordResetEmail } from '../messaging/templates.js';
import { loadSampleData } from '../seed/load.js';
import { snapshot } from '../snapshot.js';

export const auth = Router();

const limiter = rateLimit({
  windowMs: 15 * 60_000, limit: config.isTest ? 10_000 : config.authRateLimit, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

const COLORS = ['#4169E1', '#0e9f6e', '#d97706', '#9333ea', '#e11d48', '#0891b2'];
// Used to keep response time similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

auth.post('/register', limiter, ah(async (req, res) => {
  const d = registerInput.parse(req.body);
  const hash = await bcrypt.hash(d.password, 10);
  const userId = await withTransaction(async (c) => {
    const taken = await c.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [d.email]);
    if (taken.rowCount) throw new HttpError(409, 'An account with that email already exists.', { email: 'An account with that email already exists.' });
    const w = await c.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [d.workspaceName]);
    const u = await c.query(
      `INSERT INTO users (workspace_id, name, email, password_hash, job_title, role, color) VALUES ($1,$2,$3,$4,'', 'Admin', $5) RETURNING id`,
      [w.rows[0].id, d.name, d.email, hash, COLORS[Math.floor(Math.random() * COLORS.length)]],
    );
    if (d.sampleData) await loadSampleData(c, w.rows[0].id, u.rows[0].id);
    return { userId: u.rows[0].id as string, workspaceId: w.rows[0].id as string };
  });
  setSessionCookie(res, userId.userId);
  res.status(201).json({ data: await snapshot(userId.workspaceId, userId.userId) });
}));

auth.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = loginInput.parse(req.body);
  const r = await pool.query('SELECT id, workspace_id, password_hash FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [email]);
  const u = r.rows[0];
  const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'Incorrect email or password.');
  setSessionCookie(res, u.id);
  res.json({ data: await snapshot(u.workspace_id, u.id) });
}));

auth.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

auth.get('/me', requireAuth, ah<AuthedRequest>(async (req, res) => {
  res.json({ data: await snapshot(req.auth.workspaceId, req.auth.userId) });
}));

auth.post('/change-password', requireAuth, limiter, ah<AuthedRequest>(async (req, res) => {
  const { currentPassword, newPassword } = passwordInput.parse(req.body);
  const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.auth.userId]);
  if (!(await bcrypt.compare(currentPassword, r.rows[0].password_hash))) throw new HttpError(400, 'Your current password is incorrect.', { currentPassword: 'Incorrect password.' });
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.auth.userId, await bcrypt.hash(newPassword, 10)]);
  res.json({ ok: true });
}));

// ---- Password reset by email -------------------------------------------------------------------
// Always answers the same way so the endpoint cannot be used to discover which emails have accounts.
auth.post('/forgot-password', limiter, ah(async (req, res) => {
  const { email } = forgotInput.parse(req.body);
  await withTransaction(async (c) => {
    const u = (await c.query('SELECT id, workspace_id, email FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [email.trim()])).rows[0];
    if (!u) return;
    await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [u.id]);
    const { token, hash } = newToken();
    await c.query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [u.id, hash]);
    const m = passwordResetEmail(link(`/reset-password?token=${token}`));
    await enqueue(c, { workspaceId: u.workspace_id, userId: u.id, channel: 'email', kind: 'password_reset', to: u.email, subject: m.subject, body: m.text, html: m.html });
  });
  dispatchSoon();
  res.json({ ok: true });
}));

auth.post('/reset-password', limiter, ah(async (req, res) => {
  const { token, password } = resetInput.parse(req.body);
  const hash = await bcrypt.hash(password, 10);
  await withTransaction(async (c) => {
    const r = (await c.query('SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [hashToken(token)])).rows[0];
    if (!r) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
    await c.query('UPDATE users SET password_hash = $2 WHERE id = $1', [r.user_id, hash]);
    await c.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [r.user_id]);
  });
  res.json({ ok: true });
}));

// ---- Accepting an invitation -------------------------------------------------------------------
auth.get('/invitation', ah(async (req, res) => {
  const token = String(req.query.token ?? '');
  const r = (await pool.query(
    `SELECT i.email, i.role, w.name AS workspace, u.name AS invited_by FROM invitations i JOIN workspaces w ON w.id = i.workspace_id LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`, [hashToken(token)])).rows[0];
  if (!r) throw new HttpError(404, 'This invitation is invalid, has expired, or was withdrawn.');
  res.json({ email: r.email, role: r.role, workspace: r.workspace, invitedBy: r.invited_by });
}));

auth.post('/accept-invite', limiter, ah(async (req, res) => {
  const d = acceptInviteInput.parse(req.body);
  const hash = await bcrypt.hash(d.password, 10);
  const out = await withTransaction(async (c) => {
    const inv = (await c.query(
      `SELECT * FROM invitations WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE`, [hashToken(d.token)])).rows[0];
    if (!inv) throw new HttpError(400, 'This invitation is invalid, has expired, or was withdrawn.');
    const taken = await c.query('SELECT 1 FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL', [inv.email]);
    if (taken.rowCount) throw new HttpError(409, 'An account with that email already exists.');
    // Replace a password-less sample member with the same email, otherwise create a new user.
    const sample = (await c.query('SELECT id FROM users WHERE workspace_id = $1 AND lower(email) = lower($2) AND password_hash IS NULL', [inv.workspace_id, inv.email])).rows[0];
    const u = sample
      ? (await c.query('UPDATE users SET name = $2, password_hash = $3, role = $4 WHERE id = $1 RETURNING id', [sample.id, d.name, hash, inv.role])).rows[0]
      : (await c.query('INSERT INTO users (workspace_id, name, email, password_hash, role, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [inv.workspace_id, d.name, inv.email, hash, inv.role, COLORS[Math.floor(Math.random() * COLORS.length)]])).rows[0];
    await c.query('UPDATE invitations SET accepted_at = now() WHERE id = $1', [inv.id]);
    return { userId: u.id as string, workspaceId: inv.workspace_id as string };
  });
  setSessionCookie(res, out.userId);
  res.status(201).json({ data: await snapshot(out.workspaceId, out.userId) });
}));
