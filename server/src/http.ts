import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found.`);

export const ah = <R extends Request = Request>(fn: (req: R, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req as R, res).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, fields: err.fields });
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    err.issues.forEach((i) => { fields[i.path.join('.') || '_'] ??= i.message; });
    return res.status(400).json({ error: Object.values(fields)[0] ?? 'Invalid request.', fields });
  }
  const e = err as { type?: string; status?: number; code?: string };
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  if (e?.code === '23505') return res.status(409).json({ error: 'That value is already in use.' });
  if (e?.code === '22P02') return res.status(400).json({ error: 'Invalid id.' });
  if (e?.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
