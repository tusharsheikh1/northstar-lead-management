import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { startScheduler, stopScheduler } from './messaging/scheduler.js';

await migrate();
const server = createApp().listen(config.port, () => console.log(`Northstar API listening on http://localhost:${config.port}`));

startScheduler();

const shutdown = () => { stopScheduler(); server.close(() => pool.end().then(() => process.exit(0))); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
