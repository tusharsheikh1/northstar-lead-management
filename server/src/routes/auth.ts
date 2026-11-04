import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { COOKIE, requireAuth, setSessionCookie, type AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { ah, HttpError } from '../http.js';
import { loginInput, passwordInput, registerInput } from '../validation.js';
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
