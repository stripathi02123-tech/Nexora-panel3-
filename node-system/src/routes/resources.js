'use strict';

const express  = require('express');
const { v4: uuid } = require('uuid');
const registry = require('../services/registry');

const router = express.Router();

// GET /api/resources
// Returns all registered entries + global stats
router.get('/', (req, res) => {
  res.json({ stats: registry.getStats(), servers: registry.all() });
});

// POST /api/resources
// Register a new server slot (call this from your panel when creating a server)
// Body: { id?, type, label, allocatedRamMB, allocatedCpuCores }
router.post('/', (req, res) => {
  const { type, label, allocatedRamMB, allocatedCpuCores } = req.body;
  if (!type || !label) return res.status(400).json({ error: 'type and label required' });

  const id = req.body.id || uuid();
  try {
    const entry = registry.register({ id, type, label,
      allocatedRamMB:    parseFloat(allocatedRamMB)   || 512,
      allocatedCpuCores: parseFloat(allocatedCpuCores) || 0.5
    });
    res.status(201).json({ entry });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// PATCH /api/resources/:id
// Reallocate resources (e.g. bump RAM for a Minecraft server)
router.patch('/:id', (req, res) => {
  try {
    const entry = registry.update(req.params.id, {
      allocatedRamMB:    req.body.allocatedRamMB    !== undefined ? parseFloat(req.body.allocatedRamMB)    : undefined,
      allocatedCpuCores: req.body.allocatedCpuCores !== undefined ? parseFloat(req.body.allocatedCpuCores) : undefined,
      label: req.body.label
    });
    res.json({ entry });
  } catch (err) {
    res.status(err.message.startsWith('Not enough') ? 409 : 404).json({ error: err.message });
  }
});

// DELETE /api/resources/:id
router.delete('/:id', (req, res) => {
  const ok = registry.unregister(req.params.id);
  ok ? res.json({ message: 'Unregistered' }) : res.status(404).json({ error: 'Not found' });
});

module.exports = router;
