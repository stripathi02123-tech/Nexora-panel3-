'use strict';

const crypto = require('crypto');
const SECRET = String(process.env.NODE_SECRET || '').trim();

function authMiddleware(req, res, next) {
  if (!SECRET || SECRET.length < 32) {
    return res.status(503).json({ error: 'Node authentication is not configured.' });
  }

  const provided = String(req.headers['x-node-secret'] || '');
  if (!provided || provided.length !== SECRET.length) {
    return res.status(401).json({ error: 'Invalid or missing X-Node-Secret header.' });
  }

  const expected = Buffer.from(SECRET, 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (!crypto.timingSafeEqual(expected, actual)) {
    return res.status(401).json({ error: 'Invalid or missing X-Node-Secret header.' });
  }

  next();
}

module.exports = { authMiddleware };
