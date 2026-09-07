'use strict';

const path = require('path');

// dotenv resolves relative to process.cwd() by default, which is unreliable —
// systemd, nohup, or a plain `node index.js` from a different directory can
// all leave the Node Agent's .env undiscovered, silently starting the agent
// with no NODE_SECRET. Resolve the .env path from this file's own location
// instead so configuration loads the same way no matter how the process is
// launched. This file lives at <NODE_DIR>/src/index.js, so .env is one
// directory up.
const ENV_PATH = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: ENV_PATH });

const http = require('http');
const app  = require('./app');
const { initWS }         = require('./services/wsServer');
const { startMetrics }   = require('./services/metrics');
const { startWatchdog }  = require('./services/watchdog');
const logger             = require('./utils/logger');

// ── Validate startup configuration before listening ──────────────────────────
// Starting up "healthy" without a usable NODE_SECRET is the single most
// common cause of a Node Agent that looks ONLINE at the process level but
// is reported OFFLINE by the Panel (every authenticated request gets a 503).
// Fail loudly here instead.
const NODE_SECRET = String(process.env.NODE_SECRET || '').trim();
const rawPort = process.env.PORT;
const PORT = rawPort ? parseInt(rawPort, 10) : 4000;
const HOST = process.env.HOST || '0.0.0.0';

const configErrors = [];
if (!NODE_SECRET) {
  configErrors.push(`NODE_SECRET is not set. Expected it in ${ENV_PATH} (process.cwd() was ${process.cwd()}).`);
} else if (NODE_SECRET.length < 32) {
  configErrors.push('NODE_SECRET must be at least 32 characters.');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  configErrors.push(`PORT is invalid: ${rawPort}`);
}
if (!HOST || typeof HOST !== 'string') {
  configErrors.push('HOST is invalid.');
}

if (configErrors.length > 0) {
  // Never print the secret itself, only the fact that it is missing/invalid.
  logger.error('Node Agent startup configuration is invalid:');
  for (const err of configErrors) logger.error(`  - ${err}`);
  logger.error(`Checked for .env at: ${ENV_PATH}`);
  process.exit(1);
}

const server = http.createServer(app);
initWS(server);

server.listen(PORT, HOST, () => {
  logger.info(`Node Agent listening on ${HOST}:${PORT}`);
  startMetrics();
  startWatchdog();
});

// ── Keep alive on errors ─────────────────────────────────────────────────────
process.on('uncaughtException',  err  => logger.error('uncaughtException',  err.message));
process.on('unhandledRejection', err  => logger.error('unhandledRejection', String(err)));

// ── Graceful shutdown ────────────────────────────────────────────────────────
['SIGTERM','SIGINT'].forEach(sig => process.on(sig, () => {
  logger.warn(`${sig} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}));
