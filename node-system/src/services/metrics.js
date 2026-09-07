'use strict';

const si       = require('systeminformation');
const logger   = require('../utils/logger');
const { broadcast } = require('./wsServer');

let interval = null;
let latest   = null;

async function collect() {
  try {
    const [load, mem, disk, net] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats()
    ]);

    latest = {
      ts:  Date.now(),
      cpu: {
        totalLoad: +load.currentLoad.toFixed(1),
        cores: load.cpus?.map(c => +c.load.toFixed(1)) || []
      },
      memory: {
        totalMB:   Math.round(mem.total   / 1024 / 1024),
        usedMB:    Math.round(mem.used    / 1024 / 1024),
        freeMB:    Math.round(mem.free    / 1024 / 1024),
        cachedMB:  Math.round((mem.cached || 0) / 1024 / 1024),
        pct:       +((mem.used / mem.total) * 100).toFixed(1)
      },
      disk: disk.slice(0, 4).map(d => ({
        fs:     d.fs,
        mount:  d.mount,
        sizeGB: +(d.size / 1e9).toFixed(1),
        usedGB: +(d.used / 1e9).toFixed(1),
        pct:    +d.use
      })),
      network: net.slice(0, 2).map(n => ({
        iface:   n.iface,
        rxKBs:   +(n.rx_sec / 1024).toFixed(1),
        txKBs:   +(n.tx_sec / 1024).toFixed(1)
      }))
    };

    broadcast({ type: 'metrics', payload: latest });
  } catch (err) {
    logger.warn('Metrics collect error:', err.message);
  }
}

function startMetrics() {
  const ms = parseInt(process.env.METRICS_INTERVAL_MS) || 5000;
  collect();
  interval = setInterval(collect, ms);
  logger.info(`Metrics collection started every ${ms}ms`);
}

function stopMetrics()  { clearInterval(interval); }
function getLatest()    { return latest; }

module.exports = { startMetrics, stopMetrics, getLatest, collect };
