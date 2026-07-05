#!/usr/bin/env node

import { runStdioServer } from './server';
import { AKEYLESS_SDK_VERSION, CONNECTOR_VERSION } from './version';

process.stderr.write(
  `[akeyless-claude-mcp] v${CONNECTOR_VERSION} · Akeyless Node.js SDK v${AKEYLESS_SDK_VERSION}\n`,
);

runStdioServer().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[akeyless-claude-mcp] Fatal: ${message}\n`);
  process.exit(1);
});
