#!/usr/bin/env node
import { main } from './app.js';

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});
