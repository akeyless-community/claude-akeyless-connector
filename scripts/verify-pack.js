#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const checks = [
  'node_modules/debug/src/index.js',
  'node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js',
  'dist/index.js',
  'dist/server.js',
  'manifest.json',
  'icon.png',
];

const missing = checks.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));

if (missing.length > 0) {
  console.error('MCPB pack verification failed. Missing required bundle files:');
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log('MCPB pack verification passed.');
