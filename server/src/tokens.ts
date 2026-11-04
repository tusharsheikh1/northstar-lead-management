import { createHash, randomBytes } from 'node:crypto';

/** Random URL-safe token; only its SHA-256 hash is stored, so a database leak cannot be used to reset or join. */
export function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
