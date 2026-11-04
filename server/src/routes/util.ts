import type { Client } from '../db.js';
import { withTransaction } from '../db.js';
import { ah, HttpError, notFound } from '../http.js';
import type { AuthedRequest } from '../auth.js';
import { snapshot } from '../snapshot.js';
import { dispatchSoon } from '../messaging/outbox.js';

/** Runs `fn` in a transaction, then responds with `{ result, data }` where data is the fresh workspace snapshot. */
export function mutation<T>(fn: (c: Client, req: AuthedRequest) => Promise<T>, status = 200) {
  return ah<AuthedRequest>(async (req, res) => {
    const result = await withTransaction((c) => fn(c, req));
    dispatchSoon();
    const data = await snapshot(req.auth.workspaceId, req.auth.userId);
    res.status(status).json({ result, data });
  });
}

export async function assertMember(c: Client, workspaceId: string, userId: string | null | undefined, label = 'Owner') {
  if (!userId) return;
  const r = await c.query('SELECT 1 FROM users WHERE id = $1 AND workspace_id = $2', [userId, workspaceId]);
  if (!r.rowCount) throw new HttpError(400, `${label} is not a member of this workspace.`, { [label.toLowerCase()]: 'Not a member of this workspace.' });
}

export async function getLead(c: Client, workspaceId: string, id: string) {
  const r = await c.query('SELECT * FROM leads WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  if (!r.rows[0]) throw notFound('Lead');
  return r.rows[0];
}
export async function getDeal(c: Client, workspaceId: string, id: string) {
  const r = await c.query('SELECT * FROM deals WHERE id = $1 AND workspace_id = $2 FOR UPDATE', [id, workspaceId]);
  if (!r.rows[0]) throw notFound('Deal');
  return r.rows[0];
}

/** Builds `SET col = $n, ...` from a camelCase patch using an allow-list of column names. */
export function buildSet(patch: Record<string, unknown>, columns: Record<string, string>, startAt = 1) {
  const sets: string[] = []; const values: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !columns[k]) continue;
    values.push(v); sets.push(`${columns[k]} = $${startAt + values.length - 1}`);
  }
  return { sets, values };
}
