import pg from 'pg';
import { config } from './config.js';

// timestamptz -> ISO string, numeric -> number (money values fit comfortably in a double).
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
export type Client = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
