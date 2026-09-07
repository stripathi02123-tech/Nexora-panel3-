'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { authMiddleware } = require('./middleware/auth');
const resourceRoutes = require('./routes/resources');
const processRoutes = require('./routes/processes');
const metricsRoutes = require('./routes/metrics');
const allocationRoutes = require('./routes/allocation');

const app = express();
app.use(helmet());
app.use(express.json());

// Rate limiting must not be able to make a healthy node look offline.
// Previously a single global limiter covered /health too, so heavy Panel
// polling (health + metrics + allocation + resources, potentially from
// several admins/monitors at once) could 429 the health check itself and
// get the node marked OFFLINE even though it was up. /health now has its
// own generous limiter; the stricter limiter only applies to /api.
const healthLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Keep /health compatible with the installer and external uptime probes.
// When the Panel supplies X-Node-Secret, validate it before responding.
app.get('/health', healthLimiter, (req, res, next) => {
  if (req.headers['x-node-secret']) {
    return authMiddleware(req, res, () => {
      res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
    });
  }

  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

app.use('/api', apiLimiter, authMiddleware);
app.use('/api/resources', resourceRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/allocation', allocationRoutes);

app.use((err, req, res, _next) => {
  require('./utils/logger').error('Express error:', err.message);
  res.status(500).json({ error: 'Internal error' });
});

module.exports = app;
