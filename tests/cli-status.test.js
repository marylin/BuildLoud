// tests/cli-status.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';
import * as db from '../lib/db.js';
import * as errors from '../lib/errors.js';

const TMP = join(import.meta.dirname, 'tmp-status');
const CACHE_PATH = join(TMP, 'cache.json');
const QUEUE_PATH = join(TMP, 'pending-sync.jsonl');
const LOG_PATH = join(TMP, 'errors.log');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  cache.setCachePath(CACHE_PATH);
  db.setQueuePath(QUEUE_PATH);
  errors.setLogPath(LOG_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// Helper to capture console.log output
async function captureOutput(fn) {
  const lines = [];
  const origLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = origLog;
  }
  return lines.join('\n');
}

describe('journey status', () => {
  it('outputs status with no data (fresh state)', async () => {
    const { run } = await import('../lib/cli/status.js');
    const output = await captureOutput(() => run([]));
    assert.match(output, /Last capture/i);
    assert.match(output, /Queue/i);
    assert.match(output, /Weekly/i);
  });

  it('shows queue stats when entries pending', async () => {
    db.enqueue({ project: 'test', type: 'feature', source: 'stop_hook', summary: 'x' });
    const { run } = await import('../lib/cli/status.js');
    const output = await captureOutput(() => run([]));
    assert.match(output, /1 pending/);
  });

  it('shows recent errors when present', async () => {
    errors.logError('TEST', 'something broke');
    const { run } = await import('../lib/cli/status.js');
    const output = await captureOutput(() => run([]));
    assert.match(output, /something broke/);
  });
});
