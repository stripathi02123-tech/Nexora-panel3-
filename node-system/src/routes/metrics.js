'use strict';

const express = require('express');
const { getLatest, collect } = require('../services/metrics');

const router = express.Router();

// GET /api/metrics  — latest snapshot (collected on interval)
router.get('/', (req, res) => {
  const m = getLatest();
  if (!m) return res.status(503).json({ error: 'Metrics not yet collected' });
  res.json(m);
});

// GET /api/metrics/fresh  — force a fresh collect right now
router.get('/fresh', async (req, res) => {
  await collect();
  res.json(getLatest());
});

module.exports = router;
