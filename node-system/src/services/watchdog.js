'use strict';

const schedule = require('node-schedule');
const registry = require('./registry');
const pm       = require('./processManager');
const logger   = require('../utils/logger');

const restartQueue = new Map();  // id → { config, attempts, nextRetry }
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE = 3000;  // ms, doubles each attempt

function registerRestart(id, spawnConfig) {
  restartQueue.set(id, { config: spawnConfig, attempts: 0 });
}

function unregisterRestart(id) {
  restartQueue.delete(id);
}

function startWatchdog() {
  // Check every 5 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [id, meta] of restartQueue) {
      const entry = registry.get(id);
      if (!entry) { restartQueue.delete(id); continue; }

      // Only restart if status is 'crashed' and it's time to retry
      if (entry.status === 'crashed' && !pm.isRunning(id)) {
        if (meta.attempts >= MAX_ATTEMPTS) {
          logger.error(`Watchdog: ${id} exceeded max restart attempts (${MAX_ATTEMPTS}). Giving up.`);
          restartQueue.delete(id);
          continue;
        }
        if (meta.nextRetry && now < meta.nextRetry) continue;

        meta.attempts++;
        const delay = BACKOFF_BASE * Math.pow(2, meta.attempts - 1);
        meta.nextRetry = now + delay;

        logger.warn(`Watchdog: restarting ${id} (attempt ${meta.attempts}/${MAX_ATTEMPTS}, next backoff ${delay}ms)`);
        try {
          pm.startProcess(id, meta.config);
          meta.attempts = 0;   // reset on success
        } catch (err) {
          logger.error(`Watchdog restart failed for ${id}: ${err.message}`);
        }
      }
    }
  }, 5000);

  logger.info('Watchdog started');
}

module.exports = { startWatchdog, registerRestart, unregisterRestart };
