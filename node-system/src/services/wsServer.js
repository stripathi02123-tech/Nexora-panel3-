'use strict';

const { WebSocketServer } = require('ws');
const logger = require('../utils/logger');

let wss = null;
const clients = new Set();

function configuredSecret() {
  return String(process.env.NODE_SECRET || '').trim();
}

function initWS(httpServer) {
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    // Prefer the X-Node-Secret header (same mechanism as the REST API) since
    // headers aren't written to access logs the way query strings often are.
    // The `?secret=` query param is kept only for backward compatibility and
    // is deprecated — it can end up in proxy/access logs.
    const headerSecret = req.headers['x-node-secret'];
    const querySecret = url.searchParams.get('secret');
    const usedQueryParam = !headerSecret && !!querySecret;
    const secret = String(headerSecret || querySecret || '');
    const expected = configuredSecret();

    if (!expected || expected.length < 32 || !secret || secret.length !== expected.length || secret !== expected) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    if (usedQueryParam) {
      logger.warn('WS client authenticated via deprecated ?secret= query param — use the X-Node-Secret header instead.');
    }

    clients.add(ws);
    logger.info(`WS client connected (total: ${clients.size})`);

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') safeSend(ws, { type: 'pong', ts: Date.now() });
      } catch {
        // Ignore malformed client messages.
      }
    });

    safeSend(ws, { type: 'connected', ts: Date.now() });
  });

  setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState !== ws.OPEN) {
        clients.delete(ws);
        continue;
      }
      ws.ping();
    }
  }, 30_000);

  logger.info('WebSocket server ready');
}

function safeSend(ws, data) {
  try {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  } catch {
    // Ignore broken sockets.
  }
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    try {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    } catch {
      clients.delete(ws);
    }
  }
}

module.exports = { initWS, broadcast };
