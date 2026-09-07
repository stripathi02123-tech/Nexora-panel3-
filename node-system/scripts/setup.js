#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const envExample = path.resolve(__dirname, '../.env.example');
const envTarget  = path.resolve(__dirname, '../.env');
const dataDir    = path.resolve(__dirname, '../data');
const logDir     = path.resolve(__dirname, '../logs');

if (!fs.existsSync(envTarget)) {
  fs.copyFileSync(envExample, envTarget);
  console.log('✅ .env created — edit it and set NODE_SECRET before starting!');
} else {
  console.log('ℹ️  .env already exists');
}

[dataDir, logDir].forEach(d => {
  if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); console.log(`📁 Created ${d}`); }
});

console.log('\nDone! Run:  npm install && npm start\n');
