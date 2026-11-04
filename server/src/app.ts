import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth, type AuthedRequest } from './auth.js';
import { ah, errorHandler } from './http.js';
import { pool } from './db.js';
import { snapshot } from './snapshot.js';
import { auth } from './routes/auth.js';
import { leads } from './routes/leads.js';
import { deals } from './routes/deals.js';
import { tasks } from './routes/tasks.js';
import { account } from './routes/account.js';
import { invitations } from './routes/invitations.js';
import { integrations } from './routes/integrations.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: config.isProd ? undefined : false }));
  if (config.corsOrigin) {
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.get('/health', ah(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
  api.use('/auth', auth);
  api.get('/data', requireAuth, ah<AuthedRequest>(async (req, res) => { res.json({ data: await snapshot(req.auth.workspaceId, req.auth.userId) }); }));
  api.use('/leads', requireAuth, leads);
  api.use('/deals', requireAuth, deals);
  api.use('/tasks', requireAuth, tasks);
  api.use('/invitations', requireAuth, invitations);
  api.use('/integrations', requireAuth, integrations);
  api.use('/', requireAuth, account);
  api.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use('/api', api);

  // In production the API also serves the built frontend (single deployable).
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
