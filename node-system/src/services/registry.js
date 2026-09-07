'use strict';

/**
 * In-memory resource registry.
 * Each registered server (VM or Minecraft) has a slot:
 *   { id, type, label, allocatedRamMB, allocatedCpuCores, pid, status }
 *
 * Totals are compared against MAX_TOTAL_RAM_MB / MAX_TOTAL_CPU_CORES
 * before any new allocation is accepted.
 */

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PERSIST_PATH = path.resolve('./data/registry.json');
const registry     = new Map();   // id → entry

const LIMITS = {
  ramMB : parseInt(process.env.MAX_TOTAL_RAM_MB)      || 8192,
  cores : parseFloat(process.env.MAX_TOTAL_CPU_CORES) || 4
};

// ── Persist helpers ──────────────────────────────────────────────────────────
function save() {
  fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
  fs.writeFileSync(PERSIST_PATH, JSON.stringify([...registry.values()], null, 2));
}
function load() {
  if (!fs.existsSync(PERSIST_PATH)) return;
  try {
    const entries = JSON.parse(fs.readFileSync(PERSIST_PATH, 'utf8'));
    entries.forEach(e => {
      e.status = 'stopped';   // reset on reboot
      registry.set(e.id, e);
    });
    logger.info(`Registry: loaded ${entries.length} entries`);
  } catch (err) {
    logger.warn('Registry load failed:', err.message);
  }
}
load();

// ── Helpers ──────────────────────────────────────────────────────────────────
function totals() {
  let ramMB = 0, cores = 0;
  for (const e of registry.values()) {
    ramMB += e.allocatedRamMB || 0;
    cores += e.allocatedCpuCores || 0;
  }
  return { ramMB, cores };
}

function available() {
  const used = totals();
  return {
    ramMB : LIMITS.ramMB  - used.ramMB,
    cores : LIMITS.cores  - used.cores
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
function register({ id, type, label, allocatedRamMB = 512, allocatedCpuCores = 0.5 }) {
  const avail = available();
  if (allocatedRamMB > avail.ramMB)
    throw new Error(`Not enough RAM. Requested ${allocatedRamMB} MB, available ${avail.ramMB} MB`);
  if (allocatedCpuCores > avail.cores)
    throw new Error(`Not enough CPU. Requested ${allocatedCpuCores} cores, available ${avail.cores}`);

  const entry = { id, type, label, allocatedRamMB, allocatedCpuCores, pid: null, status: 'registered', createdAt: new Date().toISOString() };
  registry.set(id, entry);
  save();
  logger.info(`Registered [${type}] "${label}" — RAM:${allocatedRamMB}MB CPU:${allocatedCpuCores}`);
  return entry;
}

function unregister(id) {
  const e = registry.get(id);
  if (!e) return false;
  registry.delete(id);
  save();
  logger.info(`Unregistered ${id}`);
  return true;
}

function update(id, fields) {
  const e = registry.get(id);
  if (!e) throw new Error(`Unknown id: ${id}`);
  // If changing allocation, recheck limits
  const newRam   = fields.allocatedRamMB   ?? e.allocatedRamMB;
  const newCores = fields.allocatedCpuCores ?? e.allocatedCpuCores;
  const diff = { ramMB: newRam - e.allocatedRamMB, cores: newCores - e.allocatedCpuCores };
  const avail = available();
  if (diff.ramMB   > avail.ramMB)  throw new Error(`Not enough RAM for reallocation`);
  if (diff.cores   > avail.cores)  throw new Error(`Not enough CPU for reallocation`);

  Object.assign(e, fields, { updatedAt: new Date().toISOString() });
  save();
  return e;
}

function get(id)     { return registry.get(id) || null; }
function all()       { return [...registry.values()]; }
function getLimits() { return { ...LIMITS }; }
function getStats()  { return { limits: LIMITS, used: totals(), available: available(), count: registry.size }; }

module.exports = { register, unregister, update, get, all, getLimits, getStats };
