'use strict';

const { spawn }  = require('child_process');
const registry   = require('./registry');
const logger     = require('../utils/logger');
const { broadcast } = require('./wsServer');

// pid → { id, proc, logs[] }
const running = new Map();

// ── Spawn ────────────────────────────────────────────────────────────────────
function startProcess(id, { command, args = [], cwd, env = {} }) {
  if (isRunning(id)) throw new Error(`Process ${id} is already running`);

  const entry = registry.get(id);
  if (!entry) throw new Error(`No registered entry for id: ${id}`);

  const proc = spawn(command, args, {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  const slot = { id, proc, logs: [] };
  running.set(id, slot);
  registry.update(id, { pid: proc.pid, status: 'running' });

  function pushLog(line) {
    slot.logs.push({ ts: Date.now(), line });
    if (slot.logs.length > 1000) slot.logs.shift();
    broadcast({ type: 'log', id, line });
  }

  proc.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(pushLog));
  proc.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => pushLog('[ERR] ' + l)));

  proc.on('close', code => {
    running.delete(id);
    registry.update(id, { pid: null, status: code === 0 ? 'stopped' : 'crashed' });
    broadcast({ type: 'status', id, status: code === 0 ? 'stopped' : 'crashed', code });
    logger.info(`Process ${id} exited with code ${code}`);
  });

  proc.on('error', err => {
    running.delete(id);
    registry.update(id, { pid: null, status: 'error' });
    broadcast({ type: 'status', id, status: 'error', error: err.message });
    logger.error(`Process ${id} error: ${err.message}`);
  });

  logger.info(`Started process ${id} (pid=${proc.pid}): ${command} ${args.join(' ')}`);
  broadcast({ type: 'status', id, status: 'running', pid: proc.pid });
  return proc.pid;
}

// ── Stop ─────────────────────────────────────────────────────────────────────
function stopProcess(id, force = false) {
  const slot = running.get(id);
  if (!slot) throw new Error(`Process ${id} is not running`);

  if (force) {
    slot.proc.kill('SIGKILL');
  } else {
    // Try graceful first; SIGKILL after 8 s
    slot.proc.stdin.write('stop\n');   // works for Minecraft; ignored otherwise
    setTimeout(() => {
      if (running.has(id)) slot.proc.kill('SIGTERM');
    }, 3000);
    setTimeout(() => {
      if (running.has(id)) slot.proc.kill('SIGKILL');
    }, 8000);
  }
}

// ── Send stdin ───────────────────────────────────────────────────────────────
function sendInput(id, text) {
  const slot = running.get(id);
  if (!slot) throw new Error(`Process ${id} not running`);
  slot.proc.stdin.write(text + '\n');
}

// ── Queries ──────────────────────────────────────────────────────────────────
function isRunning(id) {
  const slot = running.get(id);
  if (!slot) return false;
  try { process.kill(slot.proc.pid, 0); return true; }
  catch { running.delete(id); return false; }
}

function getLogs(id, lines = 100) {
  return running.get(id)?.logs.slice(-lines) || [];
}

function listRunning() {
  return [...running.entries()].map(([id, s]) => ({ id, pid: s.proc.pid }));
}

module.exports = { startProcess, stopProcess, sendInput, isRunning, getLogs, listRunning };
