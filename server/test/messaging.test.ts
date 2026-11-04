import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SMTPServer } from 'smtp-server';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://northstar:northstar@localhost:5432/northstar_test';
process.env.DISABLE_SCHEDULER = 'true';

// --- A real SMTP server that records what it receives (proves actual SMTP delivery) -------------
type Mail = { to: string[]; raw: string; text: string; subject: string };
const inbox: Mail[] = [];
const decodeQp = (s: string) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'],
  onRcptTo(addr, _s, cb) { cb(); void addr; },
  onData(stream, session, cb) {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const subject = decodeQp(raw.match(/^Subject: (.*)$/m)?.[1] ?? '');
      inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), raw, text: decodeQp(raw), subject });
      cb();
    });
  },
});
await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
const smtpPort = (smtp.server.address() as { port: number }).port;

// --- A mock SMS gateway ---------------------------------------------------------------------------
type SmsCall = { path: string; contentType: string; body: Record<string, string> };
const smsCalls: SmsCall[] = [];
let smsReply: (c: SmsCall) => unknown = () => ({ response_code: 202 });
const sms = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString();
    const ct = String(req.headers['content-type'] ?? '');
    const body = ct.includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    const call = { path: req.url ?? '', contentType: ct, body };
    smsCalls.push(call);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(smsReply(call)));
  });
});
await new Promise<void>((r) => sms.listen(0, '127.0.0.1', r));
const smsPort = (sms.address() as { port: number }).port;

process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = String(smtpPort);
process.env.MAIL_FROM = 'Northstar <no-reply@northstar.test>';
process.env.APP_URL = 'http://app.test';
process.env.SMS_PROVIDER = 'bulksmsbd';
process.env.SMS_API_KEY = 'test-key';
process.env.SMS_SENDER_ID = 'NSTAR';
process.env.SMS_API_URL = `http://127.0.0.1:${smsPort}/sms`;

const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config.js');
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { dispatchQueued } = await import('../src/messaging/outbox.js');
const { runReminders, runWeeklySummaries } = await import('../src/messaging/scheduler.js');
const { normalizeBdMobile } = await import('../src/messaging/phone.js');
const { resetTransport } = await import('../src/messaging/mailer.js');
const request = (await import('supertest')).default;
const app = createApp();

async function signup(email: string, sample = false) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ name: 'Admin ' + email.split('@')[0], email, password: 'password123', workspaceName: 'WS', sampleData: sample });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { agent, me: r.body.data.settings.currentUserId as string, workspaceId: (await pool.query('SELECT workspace_id FROM users WHERE id = $1', [r.body.data.settings.currentUserId])).rows[0].workspace_id as string };
}
const lastMail = (to: string) => [...inbox].reverse().find((m) => m.to.includes(to));
const tokenFrom = (m: Mail, key: string) => m.text.match(new RegExp(`${key}\\?token=([A-Za-z0-9_-]+)`))![1];
const msgs = async (wid: string) => (await pool.query('SELECT * FROM messages WHERE workspace_id = $1 ORDER BY created_at', [wid])).rows;
const soon = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(false);
});
after(async () => { smtp.close(); sms.close(); await pool.end(); });

describe('Bangladeshi phone numbers', () => {
  it('normalises valid mobiles and rejects everything else', () => {
    for (const ok of ['01712345678', '+8801712345678', '8801712345678', '017-1234 5678', '(0171) 234-5678', '1712345678', '01312345678', '01912345678']) assert.equal(normalizeBdMobile(ok), '8801' + ok.replace(/\D/g, '').slice(-9), ok);
    for (const bad of ['01212345678', '0171234567', '017123456789', '+14155552671', '029876543', 'abc', '', '+88017123456789']) assert.equal(normalizeBdMobile(bad), null, bad);
    assert.equal(normalizeBdMobile(null), null);
  });
});

describe('invitations', () => {
  it('invites by email (real SMTP delivery), accepts once, and rejects reuse', async () => {
    const admin = await signup('inv-admin@example.com');
    const r = await admin.agent.post('/api/invitations').send({ email: 'Newbie@Example.com', role: 'Manager' });
    assert.equal(r.status, 201);
    assert.equal(r.body.emailMode, 'live');
    assert.match(r.body.invitation.link, /^http:\/\/app\.test\/accept-invite\?token=/);
    assert.equal(await dispatchQueued(), 1);
    const mail = lastMail('newbie@example.com')!;
    assert.ok(mail, 'email arrived at the SMTP server');
    assert.match(mail.subject, /invited you to WS on Northstar/);
    assert.ok(mail.text.includes('http://app.test/accept-invite?token='));
    const token = tokenFrom(mail, 'accept-invite');
    assert.equal(token, r.body.invitation.link.split('token=')[1]);

    const info = await request(app).get(`/api/auth/invitation?token=${token}`);
    assert.equal(info.body.email, 'newbie@example.com');
    assert.equal(info.body.role, 'Manager');
    assert.equal((await request(app).get('/api/auth/invitation?token=nope-nope-nope-nope-nope')).status, 404);

    assert.equal((await request(app).post('/api/auth/accept-invite').send({ token, name: 'New Bie', password: 'short' })).status, 400);
    const joined = request.agent(app);
    const ok = await joined.post('/api/auth/accept-invite').send({ token, name: 'New Bie', password: 'password123' });
    assert.equal(ok.status, 201);
    const me = ok.body.data.owners.find((o: any) => o.id === ok.body.data.settings.currentUserId);
    assert.equal(me.role, 'Manager');
    assert.equal(me.name, 'New Bie');
    assert.equal((await request(app).post('/api/auth/accept-invite').send({ token, name: 'Again', password: 'password123' })).status, 400);
    // tokens are stored hashed
    assert.equal((await pool.query('SELECT count(*)::int n FROM invitations WHERE token_hash = $1', [token])).rows[0].n, 0);
  });

  it('enforces admin-only, rejects duplicates, and supports revoking', async () => {
    const admin = await signup('inv-admin2@example.com');
    assert.equal((await admin.agent.post('/api/invitations').send({ email: 'inv-admin2@example.com' })).status, 409);
    assert.equal((await admin.agent.post('/api/invitations').send({ email: 'not-an-email' })).status, 400);
    const a = await admin.agent.post('/api/invitations').send({ email: 'rev@example.com' });
    const list = await admin.agent.get('/api/invitations');
    assert.equal(list.body.invitations.length, 1);
    // re-inviting replaces the earlier pending invitation
    const b = await admin.agent.post('/api/invitations').send({ email: 'rev@example.com' });
    assert.equal((await admin.agent.get('/api/invitations')).body.invitations.length, 1);
    assert.equal((await request(app).post('/api/auth/accept-invite').send({ token: a.body.invitation.link.split('token=')[1], name: 'X', password: 'password123' })).status, 400);
    assert.equal((await admin.agent.delete(`/api/invitations/${b.body.invitation.id}`)).status, 200);
    assert.equal((await request(app).post('/api/auth/accept-invite').send({ token: b.body.invitation.link.split('token=')[1], name: 'X', password: 'password123' })).status, 400);
    // a non-admin cannot invite
    await admin.agent.post('/api/users').send({ name: 'Rep', email: 'rep-inv@example.com', password: 'reppass123', role: 'Sales rep' });
    const rep = request.agent(app);
    await rep.post('/api/auth/login').send({ email: 'rep-inv@example.com', password: 'reppass123' });
    assert.equal((await rep.post('/api/invitations').send({ email: 'x@example.com' })).status, 403);
    // expired invitations stop working
    const c = await admin.agent.post('/api/invitations').send({ email: 'late@example.com' });
    await pool.query(`UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE email = 'late@example.com'`);
    assert.equal((await request(app).post('/api/auth/accept-invite').send({ token: c.body.invitation.link.split('token=')[1], name: 'X', password: 'password123' })).status, 400);
  });
});

describe('password reset', () => {
  it('emails a single-use, expiring link and never reveals whether an account exists', async () => {
    const u = await signup('reset-me@example.com');
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'RESET-ME@example.com' });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
    await dispatchQueued();
    assert.equal(inbox.filter((m) => m.to.includes('ghost@example.com')).length, 0);
    const mail = lastMail('reset-me@example.com')!;
    assert.match(mail.subject, /Reset your Northstar password/);
    const token = tokenFrom(mail, 'reset-password');
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token, password: 'short' })).status, 400);
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token: 'x'.repeat(43), password: 'newpassword1' })).status, 400);
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'newpassword1' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'password123' })).status, 401);
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass1' })).status, 400, 'single use');
    // a newer request invalidates the older link; expired links fail
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset-me@example.com' });
    await dispatchQueued();
    const t1 = tokenFrom(lastMail('reset-me@example.com')!, 'reset-password');
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset-me@example.com' });
    await dispatchQueued();
    const t2 = tokenFrom(lastMail('reset-me@example.com')!, 'reset-password');
    assert.notEqual(t1, t2);
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token: t1, password: 'newpassword2' })).status, 400);
    await pool.query(`UPDATE password_resets SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [u.me]);
    assert.equal((await request(app).post('/api/auth/reset-password').send({ token: t2, password: 'newpassword2' })).status, 400);
  });
});

describe('task reminders (email + SMS)', () => {
  it('sends once, to the right channels, only inside the reminder window', async () => {
    const u = await signup('remind@example.com');
    await u.agent.patch('/api/me').send({ phone: '+880 1712-345678' });
    assert.equal((await u.agent.patch('/api/me/notifications').send({ smsReminders: true })).status, 200);
    const mk = (title: string, dueAt: string) => u.agent.post('/api/tasks').send({ title, ownerId: u.me, dueAt, priority: 'High' });
    await mk('Call Dhaka client', soon(30));
    await mk('Far away task', soon(300));
    const done = (await mk('Already done', soon(20))).body.result.id;
    await u.agent.post(`/api/tasks/${done}/complete`).send({ completed: true });
    await mk('Missed long ago', soon(-60 * 48));

    inbox.length = 0; smsCalls.length = 0;
    assert.equal(await runReminders(), 1);
    assert.equal(await runReminders(), 0, 'not sent twice');
    assert.equal(await dispatchQueued(), 2);
    const mail = lastMail('remind@example.com')!;
    assert.match(mail.subject, /Reminder: Call Dhaka client/);
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0].body.number, '8801712345678');
    assert.equal(smsCalls[0].body.api_key, 'test-key');
    assert.equal(smsCalls[0].body.senderid, 'NSTAR');
    assert.match(smsCalls[0].body.message, /Call Dhaka client/);
    const rows = await msgs(u.workspaceId);
    assert.deepEqual(rows.filter((m) => m.kind === 'task_reminder').map((m) => `${m.channel}:${m.status}`).sort(), ['email:sent', 'sms:sent']);

    // moving the due time re-arms the reminder
    const far = (await pool.query(`SELECT id FROM tasks WHERE title = 'Far away task'`)).rows[0].id;
    await u.agent.patch(`/api/tasks/${far}`).send({ dueAt: soon(10) });
    assert.equal(await runReminders(), 1);
  });

  it('respects the user’s preferences and skips sample members', async () => {
    const u = await signup('remind-off@example.com', true);
    await u.agent.patch('/api/me/notifications').send({ taskReminders: false });
    await u.agent.post('/api/tasks').send({ title: 'Quiet task', ownerId: u.me, dueAt: soon(15), priority: 'Low' });
    await runReminders();
    const rows = (await msgs(u.workspaceId)).filter((m) => m.kind === 'task_reminder');
    assert.equal(rows.length, 0);
    // sample data tasks never trigger reminders
    assert.equal((await pool.query(`SELECT count(*)::int n FROM tasks WHERE workspace_id = $1 AND reminder_sent_at IS NULL`, [u.workspaceId])).rows[0].n, 0);
  });

  it('only allows SMS reminders with a valid Bangladeshi mobile number', async () => {
    const u = await signup('sms-pref@example.com');
    const r = await u.agent.patch('/api/me/notifications').send({ smsReminders: true });
    assert.equal(r.status, 400);
    assert.ok(r.body.fields.smsReminders);
    await u.agent.patch('/api/me').send({ phone: '01912345678' });
    assert.equal((await u.agent.patch('/api/me/notifications').send({ smsReminders: true })).body.data.settings.notifications.smsReminders, true);
    const after = await u.agent.patch('/api/me').send({ phone: '+14155552671' });
    assert.equal(after.body.data.settings.notifications.smsReminders, false, 'turned off when the number stops being a BD mobile');
    assert.equal((await u.agent.patch('/api/me').send({ phone: 'not a phone' })).status, 400);
  });
});

describe('weekly summary', () => {
  it('is sent once, on Monday morning in the workspace time zone, to opted-in users', async () => {
    const u = await signup('weekly@example.com', true);
    await u.agent.patch('/api/workspace').send({ timeZone: 'Asia/Dhaka', currency: 'BDT' });
    await u.agent.patch('/api/me/notifications').send({ weeklySummary: true });
    const mondayBefore8 = new Date('2026-11-02T01:00:00Z'); // 07:00 in Dhaka
    const monday9 = new Date('2026-11-02T03:00:00Z');        // 09:00 in Dhaka
    const tuesday = new Date('2026-11-03T05:00:00Z');
    assert.equal(await runWeeklySummaries(mondayBefore8), 0);
    assert.equal(await runWeeklySummaries(tuesday), 0);
    inbox.length = 0;
    assert.equal(await runWeeklySummaries(monday9), 1);
    assert.equal(await runWeeklySummaries(monday9), 0, 'deduplicated');
    assert.equal(await runWeeklySummaries(new Date('2026-11-02T10:00:00Z')), 0, 'same week, later the same day');
    await dispatchQueued();
    const mail = lastMail('weekly@example.com')!;
    assert.match(mail.subject, /weekly Northstar summary/);
    assert.match(mail.text, /Open pipeline: .*across \d+ deals/);
    assert.match(mail.text, /BDT|৳|Tk/);
    assert.equal(await runWeeklySummaries(new Date('2026-11-09T04:00:00Z')), 1, 'next Monday sends again');
  });
  it('does nothing for users who have not opted in', async () => {
    await signup('weekly-off@example.com');
    const before = (await pool.query(`SELECT count(*)::int n FROM messages WHERE kind = 'weekly_summary'`)).rows[0].n;
    await runWeeklySummaries(new Date('2026-11-16T04:00:00Z'));
    assert.equal((await pool.query(`SELECT count(*)::int n FROM messages WHERE kind = 'weekly_summary' AND to_address = 'weekly-off@example.com'`)).rows[0].n, 0);
    void before;
  });
});

describe('email updates (assignments)', () => {
  it('emails the new owner, but not for self-assignment, opted-out users or sample members', async () => {
    const admin = await signup('assign-admin@example.com', true);
    await admin.agent.post('/api/users').send({ name: 'Bea Rep', email: 'bea@example.com', password: 'beapass123', role: 'Sales rep' });
    const data = (await admin.agent.get('/api/data')).body.data;
    const bea = data.owners.find((o: any) => o.email === 'bea@example.com').id;
    const sampleMember = data.owners.find((o: any) => o.canSignIn === false).id;
    const lead = data.leads[0].id;
    inbox.length = 0;
    await admin.agent.patch(`/api/leads/${lead}`).send({ ownerId: bea });
    await admin.agent.patch(`/api/leads/${lead}`).send({ ownerId: admin.me }); // self
    await admin.agent.patch(`/api/leads/${lead}`).send({ ownerId: sampleMember }); // sample member: no real inbox
    await admin.agent.post('/api/tasks').send({ title: 'Prepare quote', ownerId: bea, dueAt: soon(60 * 24), priority: 'Low' });
    await dispatchQueued();
    const toBea = inbox.filter((m) => m.to.includes('bea@example.com'));
    assert.equal(toBea.length, 2);
    assert.ok(toBea.some((m) => /assigned you a lead/.test(m.subject)));
    assert.ok(toBea.some((m) => /assigned you a task: Prepare quote/.test(m.subject)));
    assert.equal(inbox.filter((m) => m.to.some((a) => a.includes('northstar.demo'))).length, 0);

    // Bea opts out; no more assignment email
    const bg = request.agent(app);
    await bg.post('/api/auth/login').send({ email: 'bea@example.com', password: 'beapass123' });
    await bg.patch('/api/me/notifications').send({ emailUpdates: false });
    inbox.length = 0;
    await admin.agent.patch(`/api/leads/${lead}`).send({ ownerId: bea });
    await dispatchQueued();
    assert.equal(inbox.length, 0);
    // bulk owner change: one email
    await bg.patch('/api/me/notifications').send({ emailUpdates: true });
    const ids = data.leads.slice(1, 6).map((l: any) => l.id);
    await admin.agent.patch('/api/leads/bulk').send({ ids, patch: { ownerId: bea } });
    await dispatchQueued();
    assert.equal(inbox.filter((m) => m.to.includes('bea@example.com')).length, 1);
    assert.match(inbox.at(-1)!.subject, /5 leads/);
  });

  it('tells the owner when someone else wins or loses their deal', async () => {
    const admin = await signup('deal-admin@example.com', true);
    await admin.agent.post('/api/users').send({ name: 'Dee Rep', email: 'dee@example.com', password: 'deepass123', role: 'Sales rep' });
    const data = (await admin.agent.get('/api/data')).body.data;
    const dee = data.owners.find((o: any) => o.email === 'dee@example.com').id;
    const open = data.deals.filter((d: any) => !['Won', 'Lost'].includes(d.stage)).slice(0, 2);
    for (const d of open) await admin.agent.patch(`/api/deals/${d.id}`).send({ ownerId: dee });
    inbox.length = 0;
    await admin.agent.post(`/api/deals/${open[0].id}/move`).send({ stage: 'Won' });
    await admin.agent.post(`/api/deals/${open[1].id}/lost`).send({ reason: 'Budget' });
    await dispatchQueued();
    const subjects = inbox.filter((m) => m.to.includes('dee@example.com')).map((m) => m.subject);
    assert.ok(subjects.some((s) => /^Deal won:/.test(s)));
    assert.ok(subjects.some((s) => /^Deal lost:/.test(s)));
  });
});

describe('sending to leads', () => {
  it('sends SMS to a Bangladeshi mobile and email to the lead, and records both', async () => {
    const u = await signup('lead-send@example.com');
    const lead = (await u.agent.post('/api/leads').send({ name: 'Rahim Uddin', company: 'Dhaka Tech', ownerId: u.me, email: 'rahim@dhakatech.example', phone: '01812-345678' })).body.result.id;
    smsCalls.length = 0; inbox.length = 0;
    const s = await u.agent.post(`/api/leads/${lead}/sms`).send({ message: 'আসসালামু আলাইকুম, আপনার ডেমো বুক করা হয়েছে।' });
    assert.equal(s.status, 201);
    const e = await u.agent.post(`/api/leads/${lead}/email`).send({ subject: 'Your demo', body: 'Hi Rahim,\n\nThanks for your time.' });
    assert.equal(e.status, 201);
    assert.equal(await dispatchQueued(), 2);
    assert.equal(smsCalls[0].body.number, '8801812345678');
    assert.ok(smsCalls[0].body.message.includes('ডেমো'), 'Unicode (Bangla) text is passed through intact');
    const mail = lastMail('rahim@dhakatech.example')!;
    assert.equal(mail.subject, 'Your demo');
    assert.ok(mail.text.includes('Thanks for your time.'));
    const list = (await u.agent.get(`/api/leads/${lead}/messages`)).body.messages;
    assert.deepEqual(list.map((m: any) => `${m.channel}:${m.status}`).sort(), ['email:sent', 'sms:sent']);
    const acts = (await u.agent.get('/api/data')).body.data.activities.map((a: any) => a.verb);
    assert.ok(acts.includes('emailed') && acts.includes('sent an SMS to'));
  });

  it('refuses bad targets, do-not-contact leads, and read-only users', async () => {
    const u = await signup('lead-guard@example.com');
    const mk = async (b: object) => (await u.agent.post('/api/leads').send({ company: 'C', ownerId: u.me, ...b })).body.result.id;
    const foreign = await mk({ name: 'Foreign', phone: '+14155552671', email: 'f@c.example' });
    const noEmail = await mk({ name: 'NoEmail', phone: '01712345678' });
    const dnc = await mk({ name: 'Optout', phone: '01712345678', email: 'o@c.example', doNotContact: true });
    assert.equal((await u.agent.post(`/api/leads/${foreign}/sms`).send({ message: 'hi' })).status, 400);
    assert.equal((await u.agent.post(`/api/leads/${noEmail}/email`).send({ subject: 's', body: 'b' })).status, 400);
    const blocked = await u.agent.post(`/api/leads/${dnc}/sms`).send({ message: 'hi' });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error, /Do not contact/);
    assert.equal((await u.agent.post(`/api/leads/${dnc}/email`).send({ subject: 's', body: 'b' })).status, 400);
    assert.equal((await u.agent.post(`/api/leads/${noEmail}/sms`).send({ message: 'x'.repeat(481) })).status, 400);
    assert.equal((await u.agent.post(`/api/leads/${noEmail}/sms`).send({ message: '' })).status, 400);
    // viewer: may read history but not send
    await u.agent.post('/api/users').send({ name: 'View', email: 'viewer-send@example.com', password: 'viewpass123', role: 'Viewer' });
    const v = request.agent(app);
    await v.post('/api/auth/login').send({ email: 'viewer-send@example.com', password: 'viewpass123' });
    assert.equal((await v.post(`/api/leads/${noEmail}/sms`).send({ message: 'hi' })).status, 403);
    assert.equal((await v.get(`/api/leads/${noEmail}/messages`)).status, 200);
    // another workspace cannot see or message the lead
    const other = await signup('lead-guard-other@example.com');
    assert.equal((await other.agent.post(`/api/leads/${noEmail}/sms`).send({ message: 'hi' })).status, 404);
    assert.deepEqual((await other.agent.get(`/api/leads/${noEmail}/messages`)).body.messages, []);
  });
});

describe('SMS gateways', () => {
  const lead = async (u: Awaited<ReturnType<typeof signup>>) => (await u.agent.post('/api/leads').send({ name: 'G', company: 'G', ownerId: u.me, phone: '+8801512345678' })).body.result.id;
  const original = { ...config.sms };
  after(() => Object.assign(config.sms, original));

  it('speaks each provider’s request format and reads its success/failure reply', async () => {
    const u = await signup('gateways@example.com');
    const id = await lead(u);
    const send = async () => { await u.agent.post(`/api/leads/${id}/sms`).send({ message: 'hello' }); smsCalls.length = 0; await dispatchQueued(); return smsCalls[0]; };
    const status = async () => (await pool.query(`SELECT status, error, provider_ref FROM messages WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];

    Object.assign(config.sms, { provider: 'alphasms', apiKey: 'alpha-key', senderId: 'ALPHA', urlOverride: `http://127.0.0.1:${smsPort}/alpha` });
    smsReply = () => ({ error: 0, msg: 'Request successfully submitted', data: { request_id: 4242 } });
    let c = await send();
    assert.equal(c.path, '/alpha');
    assert.deepEqual({ k: c.body.api_key, to: c.body.to, msg: c.body.msg, sid: c.body.sender_id }, { k: 'alpha-key', to: '8801512345678', msg: 'hello', sid: 'ALPHA' });
    assert.deepEqual(await status(), { status: 'sent', error: null, provider_ref: '4242' });

    Object.assign(config.sms, { provider: 'sslwireless', apiKey: 'ssl-token', sslSid: 'BRAND', urlOverride: `http://127.0.0.1:${smsPort}/ssl` });
    smsReply = () => ({ status: 'SUCCESS', status_code: 200 });
    c = await send();
    assert.match(c.contentType, /json/);
    assert.deepEqual({ t: c.body.api_token, sid: c.body.sid, to: c.body.msisdn, sms: c.body.sms, hasId: !!c.body.csms_id }, { t: 'ssl-token', sid: 'BRAND', to: '8801512345678', sms: 'hello', hasId: true });
    assert.equal((await status()).status, 'sent');

    Object.assign(config.sms, { provider: 'bulksmsbd', apiKey: 'bulk-key', senderId: 'BULK', urlOverride: `http://127.0.0.1:${smsPort}/bulk` });
    smsReply = () => ({ response_code: 202, success_message: 'SMS Submitted Successfully' });
    c = await send();
    assert.deepEqual({ k: c.body.api_key, n: c.body.number, s: c.body.senderid, m: c.body.message }, { k: 'bulk-key', n: '8801512345678', s: 'BULK', m: 'hello' });
    assert.equal((await status()).status, 'sent');
  });

  it('retries gateway failures with backoff, then marks the message failed', async () => {
    const u = await signup('gateway-fail@example.com');
    const id = await lead(u);
    Object.assign(config.sms, { provider: 'bulksmsbd', apiKey: 'k', urlOverride: `http://127.0.0.1:${smsPort}/bulk` });
    smsReply = () => ({ response_code: 1007, error_message: 'Balance Insufficient' });
    await u.agent.post(`/api/leads/${id}/sms`).send({ message: 'hello' });
    const row = () => pool.query(`SELECT status, attempts, error FROM messages WHERE lead_id = $1`, [id]).then((r) => r.rows[0]);
    await dispatchQueued();
    let r = await row();
    assert.equal(r.status, 'queued'); assert.equal(r.attempts, 1);
    assert.match(r.error, /Balance Insufficient/);
    assert.equal(await dispatchQueued(), 0, 'not retried before the backoff elapses');
    await pool.query(`UPDATE messages SET next_attempt_at = now() WHERE lead_id = $1`, [id]);
    await dispatchQueued();
    await pool.query(`UPDATE messages SET next_attempt_at = now() WHERE lead_id = $1`, [id]);
    await dispatchQueued();
    r = await row();
    assert.equal(r.status, 'failed'); assert.equal(r.attempts, 3);
    // a retry that eventually works is delivered once
    smsReply = () => ({ response_code: 202 });
    await u.agent.post(`/api/leads/${id}/sms`).send({ message: 'second' });
    smsCalls.length = 0;
    await dispatchQueued();
    assert.equal(smsCalls.length, 1);
  });
});

describe('channel configuration', () => {
  it('reports status honestly and records "skipped" when a channel is not configured', async () => {
    const u = await signup('config@example.com');
    const st = await u.agent.get('/api/integrations/status');
    assert.deepEqual({ e: st.body.email.mode, s: st.body.sms.mode }, { e: 'live', s: 'live' });
    assert.ok(!JSON.stringify(st.body).includes('test-key'), 'no secrets in the status response');

    const saved = { email: { ...config.email }, sms: { ...config.sms } };
    try {
      await u.agent.post('/api/users').send({ name: 'x', email: 'cfg-x@example.com', password: 'password123' });
      const inv = await u.agent.post('/api/invitations').send({ email: 'cfg-invitee@example.com' });
      Object.assign(config.email, { host: '', logOnly: false });
      Object.assign(config.sms, { provider: '', apiKey: '' });
      resetTransport();
      assert.equal((await u.agent.get('/api/integrations/status')).body.email.mode, 'none');
      assert.equal(await dispatchQueued(), 1);
      const row = (await pool.query(`SELECT status, error FROM messages WHERE to_address = 'cfg-invitee@example.com'`)).rows[0];
      assert.equal(row.status, 'skipped');
      assert.match(row.error, /not configured/);
      assert.ok(inv.body.invitation.link, 'the admin still gets the link to share manually');
      // test sends and manual sends say so plainly instead of pretending
      assert.equal((await u.agent.post('/api/integrations/email/test').send({ to: 'me@example.com' })).status, 400);
      assert.equal((await u.agent.post('/api/integrations/sms/test').send({ to: '01712345678' })).status, 400);
      const lead = (await u.agent.post('/api/leads').send({ name: 'L', company: 'C', ownerId: u.me, email: 'l@c.example', phone: '01712345678' })).body.result.id;
      assert.match((await u.agent.post(`/api/leads/${lead}/email`).send({ subject: 's', body: 'b' })).body.error, /not configured/);
      assert.match((await u.agent.post(`/api/leads/${lead}/sms`).send({ message: 'm' })).body.error, /not configured/);

      // log-only mode is labelled "logged", never "sent"
      Object.assign(config.email, { logOnly: true });
      await u.agent.post('/api/invitations').send({ email: 'cfg-logged@example.com' });
      await dispatchQueued();
      assert.equal((await pool.query(`SELECT status FROM messages WHERE to_address = 'cfg-logged@example.com'`)).rows[0].status, 'logged');
    } finally {
      Object.assign(config.email, saved.email); Object.assign(config.sms, saved.sms); resetTransport();
    }
  });

  it('retries SMTP failures and gives up after three attempts', async () => {
    const u = await signup('smtp-down@example.com');
    const savedPort = config.email.port;
    try {
      config.email.port = 1; resetTransport(); // nothing listens here
      await u.agent.post('/api/invitations').send({ email: 'smtp-down-invitee@example.com' });
      for (let i = 0; i < 3; i++) { await dispatchQueued(); await pool.query(`UPDATE messages SET next_attempt_at = now() WHERE status = 'queued'`); }
      const row = (await pool.query(`SELECT status, attempts, error FROM messages WHERE to_address = 'smtp-down-invitee@example.com'`)).rows[0];
      assert.equal(row.status, 'failed'); assert.equal(row.attempts, 3);
      assert.ok(row.error.length > 0);
    } finally { config.email.port = savedPort; resetTransport(); }
  });

  it('lets admins send test messages and lists the message log (admin only)', async () => {
    const u = await signup('tests@example.com');
    inbox.length = 0; smsCalls.length = 0;
    assert.equal((await u.agent.post('/api/integrations/email/test').send({ to: 'tester@example.com' })).body.status, 'sent');
    assert.equal(lastMail('tester@example.com')!.subject, 'Northstar test email');
    Object.assign(config.sms, { provider: 'bulksmsbd', apiKey: 'k', urlOverride: `http://127.0.0.1:${smsPort}/bulk` });
    smsReply = () => ({ response_code: 202 });
    assert.equal((await u.agent.post('/api/integrations/sms/test').send({ to: '01712345678' })).body.status, 'sent');
    assert.equal((await u.agent.post('/api/integrations/sms/test').send({ to: '12345' })).status, 400);
    smsReply = () => ({ response_code: 1002, error_message: 'Sender Id not correct' });
    const bad = await u.agent.post('/api/integrations/sms/test').send({ to: '01712345678' });
    assert.equal(bad.body.status, 'failed');
    assert.match(bad.body.error, /Sender Id not correct/);
    const log = (await u.agent.get('/api/integrations/messages')).body.messages;
    assert.equal(log.length, 3);
    assert.ok(log.every((m: any) => !('body' in m)));
    await u.agent.post('/api/users').send({ name: 'R', email: 'tests-rep@example.com', password: 'password123', role: 'Sales rep' });
    const rep = request.agent(app);
    await rep.post('/api/auth/login').send({ email: 'tests-rep@example.com', password: 'password123' });
    assert.equal((await rep.get('/api/integrations/messages')).status, 403);
    assert.equal((await rep.get('/api/integrations/status')).status, 403);
  });
});
