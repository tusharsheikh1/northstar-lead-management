import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './http.js';
import type { Role } from '../../src/types.js';

export const COOKIE = 'ns_token';

export interface AuthedRequest extends Request {
  auth: { userId: string; workspaceId: string; role: Role; name: string };
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
}

export function setSessionCookie(res: Response, userId: string) {
  res.cookie(COOKIE, signToken(userId), { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 86_400_000, path: '/' });
}

/** Verifies the session cookie and loads the user fresh, so role changes apply immediately. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new HttpError(401, 'Please sign in.');
    let sub: string;
    try { sub = (jwt.verify(token, config.jwtSecret) as { sub: string }).sub; } catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
    const { rows } = await pool.query('SELECT id, workspace_id, role, name FROM users WHERE id = $1 AND password_hash IS NOT NULL', [sub]);
    if (!rows[0]) throw new HttpError(401, 'Please sign in.');
    (req as AuthedRequest).auth = { userId: rows[0].id, workspaceId: rows[0].workspace_id, role: rows[0].role, name: rows[0].name };
    next();
  } catch (e) { next(e); }
}

/** Viewers are read-only. */
export function requireWrite(req: Request, _res: Response, next: NextFunction) {
  if ((req as AuthedRequest).auth.role === 'Viewer') return next(new HttpError(403, 'Your role (Viewer) is read-only.'));
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if ((req as AuthedRequest).auth.role !== 'Admin') return next(new HttpError(403, 'Only workspace admins can do that.'));
  next();
}
