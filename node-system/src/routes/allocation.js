'use strict';

const express  = require('express');
const registry = require('../services/registry');

const router = express.Router();

// GET /api/allocation
// Your panel calls this to see what's free before offering resource options to users
router.get('/', (req, res) => {
  res.json(registry.getStats());
});

// POST /api/allocation/check
// Body: { allocatedRamMB, allocatedCpuCores }
// Returns { ok: true } or { ok: false, reason }
router.post('/check', (req, res) => {
  const { allocatedRamMB = 0, allocatedCpuCores = 0 } = req.body;
  const stats  = registry.getStats();
  const avail  = stats.available;

  if (allocatedRamMB > avail.ramMB)
    return res.json({ ok: false, reason: `Need ${allocatedRamMB} MB RAM, only ${avail.ramMB} MB free` });
  if (allocatedCpuCores > avail.cores)
    return res.json({ ok: false, reason: `Need ${allocatedCpuCores} cores, only ${avail.cores} free` });

  res.json({ ok: true, available: avail });
});

module.exports = router;
