import { pool, withTransaction } from '../db.js';
import { config } from '../config.js';
import { dispatchQueued, enqueue } from './outbox.js';
import { normalizeBdMobile } from './phone.js';
import { link, taskReminderEmail, taskReminderSms, weeklyEmail } from './templates.js';

const validZone = (z: string) => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
/** 'auto' means "the browser's zone" in the UI; the server has no browser, so it uses UTC. */
const zoneOf = (z: string) => (z && z !== 'auto' && validZone(z) ? z : 'UTC');

function fmtWhen(iso: Date, zone: string, withDate = true) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false, ...(withDate ? { day: 'numeric', month: 'short' } : {}), timeZoneName: 'short' });
  return f.format(iso);
}
const moneyFmt = (currency: string) => { const f = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }); return (n: number) => f.format(n); };

/** Queues email/SMS reminders for open tasks that fall due within each workspace's lead time. Returns tasks processed. */
export async function runReminders(now = new Date()): Promise<number> {
  const due = await pool.query(
    `SELECT t.id, t.title, t.due_at, t.workspace_id, t.owner_id, l.company, w.time_zone
       FROM tasks t JOIN workspaces w ON w.id = t.workspace_id LEFT JOIN leads l ON l.id = t.lead_id
      WHERE NOT t.completed AND t.reminder_sent_at IS NULL
        AND t.due_at <= $1::timestamptz + (w.reminder_lead_minutes || ' minutes')::interval
        AND t.due_at >= $1::timestamptz - interval '1 day'
      ORDER BY t.due_at LIMIT 500`, [now.toISOString()]);
  for (const t of due.rows) {
    await withTransaction(async (c) => {
      const claimed = await c.query('UPDATE tasks SET reminder_sent_at = now() WHERE id = $1 AND reminder_sent_at IS NULL RETURNING id', [t.id]);
      if (!claimed.rowCount) return; // another worker got it
      const u = (await c.query('SELECT id, email, phone, notifications FROM users WHERE id = $1 AND password_hash IS NOT NULL', [t.owner_id])).rows[0];
      if (!u?.notifications?.taskReminders) return;
      const when = fmtWhen(new Date(t.due_at), zoneOf(t.time_zone));
      if (u.email) {
        const m = taskReminderEmail(t.title, when, t.company, link('/tasks'));
        await enqueue(c, { workspaceId: t.workspace_id, userId: u.id, channel: 'email', kind: 'task_reminder', to: u.email, subject: m.subject, body: m.text, html: m.html, dedupeKey: `reminder:${t.id}:email` });
      }
      const phone = normalizeBdMobile(u.phone);
      if (u.notifications.smsReminders && phone) {
        await enqueue(c, { workspaceId: t.workspace_id, userId: u.id, channel: 'sms', kind: 'task_reminder', to: phone, body: taskReminderSms(t.title, fmtWhen(new Date(t.due_at), zoneOf(t.time_zone), false), t.company), dedupeKey: `reminder:${t.id}:sms` });
      }
    });
  }
  return due.rowCount ?? 0;
}

/** Local calendar parts in a zone. */
function localParts(now: Date, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday as string, hour: Number(parts.hour), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Queues the weekly summary email for users who opted in. Sent once per local Monday, from 08:00 workspace time. */
export async function runWeeklySummaries(now = new Date()): Promise<number> {
  let queued = 0;
  const workspaces = await pool.query('SELECT id, name, currency, time_zone, probabilities FROM workspaces');
  for (const w of workspaces.rows) {
    const zone = zoneOf(w.time_zone);
    const lp = localParts(now, zone);
    if (lp.weekday !== 'Mon' || lp.hour < 8) continue;
    const recipients = (await pool.query(
      `SELECT id, name, email FROM users WHERE workspace_id = $1 AND password_hash IS NOT NULL AND email <> '' AND (notifications->>'weeklySummary')::boolean IS TRUE`, [w.id])).rows;
    if (!recipients.length) continue;
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [leads, won, open] = await Promise.all([
      pool.query('SELECT count(*)::int n FROM leads WHERE workspace_id = $1 AND created_at >= $2', [w.id, since]),
      pool.query(`SELECT count(*)::int n, COALESCE(sum(value),0) v FROM deals WHERE workspace_id = $1 AND stage = 'Won' AND closed_at >= $2`, [w.id, since]),
      pool.query(`SELECT stage, count(*)::int n, COALESCE(sum(value),0) v FROM deals WHERE workspace_id = $1 AND stage NOT IN ('Won','Lost') GROUP BY stage`, [w.id]),
    ]);
    const openValue = open.rows.reduce((a, r) => a + Number(r.v), 0);
    const weighted = open.rows.reduce((a, r) => a + (Number(r.v) * (w.probabilities[r.stage] ?? 0)) / 100, 0);
    const money = moneyFmt(w.currency);
    for (const u of recipients) {
      const tasks = (await pool.query(
        `SELECT title, due_at FROM tasks WHERE workspace_id = $1 AND owner_id = $2 AND NOT completed AND due_at < $3::timestamptz + interval '7 days' ORDER BY due_at`, [w.id, u.id, now.toISOString()])).rows;
      const m = weeklyEmail({
        name: u.name.split(' ')[0], workspace: w.name, money, newLeads: leads.rows[0].n, wonCount: won.rows[0].n, wonValue: Number(won.rows[0].v),
        openCount: open.rows.reduce((a, r) => a + r.n, 0), openValue, weighted,
        overdue: tasks.filter((t) => new Date(t.due_at) < now).length,
        upcoming: tasks.filter((t) => new Date(t.due_at) >= now).slice(0, 8).map((t) => ({ title: t.title, when: fmtWhen(new Date(t.due_at), zone) })),
        url: link('/overview'),
      });
      const id = await enqueue(pool, { workspaceId: w.id, userId: u.id, channel: 'email', kind: 'weekly_summary', to: u.email, subject: m.subject, body: m.text, html: m.html, dedupeKey: `weekly:${u.id}:${lp.date}` });
      if (id) queued++;
    }
  }
  return queued;
}

let timers: NodeJS.Timeout[] = [];
const LOCK = 7_262_026; // arbitrary advisory-lock id so only one instance runs the periodic jobs

/** Starts the background workers: outbox dispatcher (every 5s) and reminder + weekly jobs (every minute). */
export function startScheduler() {
  if (!config.scheduler.enabled || config.isTest) return;
  const safe = (fn: () => Promise<unknown>) => () => { fn().catch((e) => console.error('scheduler job failed', e)); };
  const periodic = async () => {
    const c = await pool.connect();
    try {
      const got = (await c.query('SELECT pg_try_advisory_lock($1) ok', [LOCK])).rows[0].ok;
      if (!got) return;
      try { await runReminders(); await runWeeklySummaries(); } finally { await c.query('SELECT pg_advisory_unlock($1)', [LOCK]); }
    } finally { c.release(); }
  };
  timers = [setInterval(safe(dispatchQueued), 5_000), setInterval(safe(periodic), 60_000)];
  safe(periodic)();
}
export function stopScheduler() { timers.forEach(clearInterval); timers = []; }
