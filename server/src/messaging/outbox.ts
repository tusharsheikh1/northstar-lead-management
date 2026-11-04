import type { Queryable } from '../db.js';
import { pool } from '../db.js';
import { config } from '../config.js';
import { emailMode, sendEmail } from './mailer.js';
import { sendSms, smsMode } from './sms.js';

export interface NewMessage {
  workspaceId: string; channel: 'email' | 'sms'; kind: string; to: string; subject?: string; body: string; html?: string;
  userId?: string | null; leadId?: string | null; createdBy?: string | null; dedupeKey?: string;
}

/** Adds a message to the outbox (call inside the caller's transaction). Returns the id, or null if it was a duplicate. */
export async function enqueue(q: Queryable, m: NewMessage): Promise<string | null> {
  const r = await q.query(
    `INSERT INTO messages (workspace_id, user_id, lead_id, created_by, channel, kind, to_address, subject, body, html, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
    [m.workspaceId, m.userId ?? null, m.leadId ?? null, m.createdBy ?? null, m.channel, m.kind, m.to, m.subject ?? null, m.body, m.html ?? null, m.dedupeKey ?? null],
  );
  return r.rows[0]?.id ?? null;
}

const MAX_ATTEMPTS = 3;
let running = false;

/**
 * Sends queued messages. Safe to run from several processes (rows are locked with SKIP LOCKED).
 * Provider failures are retried with backoff (2, 4 min) and then marked failed; an unconfigured
 * channel is marked "skipped" immediately and never retried.
 */
export async function dispatchQueued(limit = 25): Promise<number> {
  if (running) return 0;
  running = true;
  let processed = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM messages WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
    for (const m of rows) {
      processed++;
      const mode = m.channel === 'email' ? emailMode() : smsMode();
      if (mode === 'none') {
        await client.query(`UPDATE messages SET status = 'skipped', error = $2 WHERE id = $1`, [m.id, `${m.channel === 'email' ? 'Email' : 'SMS'} delivery is not configured on this server.`]);
        continue;
      }
      try {
        const out = m.channel === 'email'
          ? await sendEmail({ to: m.to_address, subject: m.subject ?? '', text: m.body, html: m.html ?? undefined })
          : await sendSms(m.to_address, m.body);
        await client.query(`UPDATE messages SET status = $2, sent_at = now(), attempts = attempts + 1, error = NULL, provider_ref = $3 WHERE id = $1`, [m.id, out.status, out.ref ?? null]);
      } catch (e) {
        const attempts = m.attempts + 1;
        const msg = (e as Error).message.slice(0, 500);
        const permanent = (e as { permanent?: boolean }).permanent === true;
        if (permanent || attempts >= MAX_ATTEMPTS) await client.query(`UPDATE messages SET status = 'failed', attempts = $2, error = $3 WHERE id = $1`, [m.id, attempts, msg]);
        else await client.query(`UPDATE messages SET attempts = $2, error = $3, next_attempt_at = now() + ($4 || ' minutes')::interval WHERE id = $1`, [m.id, attempts, msg, String(2 ** (attempts - 1) * 2)]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('outbox dispatch failed', e);
  } finally {
    client.release();
    running = false;
  }
  return processed;
}

/** Nudges the dispatcher shortly after a request committed, so messages go out promptly. */
export function dispatchSoon() {
  if (!config.scheduler.enabled || config.isTest) return;
  setTimeout(() => { dispatchQueued().catch(() => {}); }, 50);
}
