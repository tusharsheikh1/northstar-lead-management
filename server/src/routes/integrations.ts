import { Router } from 'express';
import { requireAdmin, type AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ah, HttpError } from '../http.js';
import { testEmailInput, testSmsInput } from '../validation.js';
import { emailMode, sendEmail } from '../messaging/mailer.js';
import { normalizeBdMobile, BD_PHONE_HINT } from '../messaging/phone.js';
import { getSmsBalance, sendSms, smsMode } from '../messaging/sms.js';
import { testEmail } from '../messaging/templates.js';

export const integrations = Router();
integrations.use(requireAdmin);

integrations.get('/status', ah<AuthedRequest>(async (_req, res) => {
  res.json({
    email: { mode: emailMode(), host: config.email.host || null, from: config.email.from },
    sms: { mode: smsMode(), provider: config.sms.provider || null },
    appUrl: config.appUrl,
  });
}));

async function record(req: AuthedRequest, channel: 'email' | 'sms', to: string, subject: string | null, body: string, run: () => Promise<{ status: 'sent' | 'logged'; ref?: string }>) {
  let status = 'failed'; let error: string | null = null; let ref: string | null = null;
  try { const r = await run(); status = r.status; ref = r.ref ?? null; } catch (e) { error = (e as Error).message; }
  await pool.query(
    `INSERT INTO messages (workspace_id, created_by, channel, kind, to_address, subject, body, status, error, attempts, provider_ref, sent_at)
     VALUES ($1,$2,$3,'test',$4,$5,$6,$7,$8,1,$9, CASE WHEN $7 IN ('sent','logged') THEN now() END)`,
    [req.auth.workspaceId, req.auth.userId, channel, to, subject, body, status, error, ref]);
  return { status, error };
}

// Sends immediately (not queued) so the admin sees the real outcome.
integrations.post('/email/test', ah<AuthedRequest>(async (req, res) => {
  const { to } = testEmailInput.parse(req.body);
  if (emailMode() === 'none') throw new HttpError(400, 'Email delivery is not configured on this server. Set SMTP_HOST (see server/.env.example).');
  const t = testEmail();
  res.json(await record(req, 'email', to, t.subject, t.text, () => sendEmail({ to, ...t })));
}));

integrations.post('/sms/test', ah<AuthedRequest>(async (req, res) => {
  const { to } = testSmsInput.parse(req.body);
  if (smsMode() === 'none') throw new HttpError(400, 'SMS delivery is not configured on this server. Set SMS_PROVIDER and SMS_API_KEY (see server/.env.example).');
  const num = normalizeBdMobile(to);
  if (!num) throw new HttpError(400, BD_PHONE_HINT, { to: BD_PHONE_HINT });
  const text = 'Northstar CRM test SMS. If you received this, SMS delivery works.';
  res.json(await record(req, 'sms', `+${num}`, null, text, () => sendSms(num, text)));
}));

integrations.get('/sms/balance', ah<AuthedRequest>(async (_req, res) => {
  try { res.json(await getSmsBalance()); }
  catch (e) { throw new HttpError(502, (e as Error).message); }
}));

integrations.get('/messages', ah<AuthedRequest>(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const r = await pool.query(
    `SELECT id, channel, kind, to_address, subject, status, error, attempts, created_at, sent_at FROM messages WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`, [req.auth.workspaceId, limit]);
  res.json({ messages: r.rows.map((m) => ({ id: m.id, channel: m.channel, kind: m.kind, to: m.to_address, subject: m.subject, status: m.status, error: m.error, attempts: m.attempts, createdAt: m.created_at, sentAt: m.sent_at })) });
}));
