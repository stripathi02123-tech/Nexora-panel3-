'use strict';

const { createLogger, format, transports } = require('winston');
const fs   = require('fs');
const path = require('path');

const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

module.exports = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat()
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`))
    }),
    new transports.File({
      filename: path.join(logDir, 'node-system.log'),
      format: format.json(),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});
