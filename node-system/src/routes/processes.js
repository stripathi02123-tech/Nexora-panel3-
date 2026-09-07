'use strict';

const express = require('express');
const pm      = require('../services/processManager');
const wd      = require('../services/watchdog');
const registry = require('../services/registry');

const router = express.Router();

// GET /api/processes  — list all running processes
router.get('/', (req, res) => {
  res.json({ running: pm.listRunning() });
});

// POST /api/processes/:id/start
// Body: { command, args[], cwd, env{}, restartPolicy: 'always'|'never' }
router.post('/:id/start', (req, res) => {
  const { id } = req.params;
  if (!registry.get(id)) return res.status(404).json({ error: 'Resource not registered. POST /api/resources first.' });

  const { command, args = [], cwd, env = {}, restartPolicy = 'never' } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });

  try {
    const pid = pm.startProcess(id, { command, args, cwd, env });
    if (restartPolicy === 'always') wd.registerRestart(id, { command, args, cwd, env });
    res.json({ pid, status: 'running' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/processes/:id/stop
// Body: { force: true|false }
router.post('/:id/stop', (req, res) => {
  const { id } = req.params;
  wd.unregisterRestart(id);   // stop watchdog from restarting it
  try {
    pm.stopProcess(id, req.body.force === true);
    res.json({ message: 'Stop signal sent' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/processes/:id/input
// Body: { text }  — write a line to stdin (e.g. Minecraft console commands)
router.post('/:id/input', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    pm.sendInput(req.params.id, text);
    res.json({ message: 'Sent' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/processes/:id/logs?lines=100
router.get('/:id/logs', (req, res) => {
  const lines = parseInt(req.query.lines) || 100;
  res.json({ logs: pm.getLogs(req.params.id, lines) });
});

// GET /api/processes/:id/status
router.get('/:id/status', (req, res) => {
  const entry = registry.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json({ ...entry, running: pm.isRunning(req.params.id) });
});

module.exports = router;
