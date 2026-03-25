// tests/cli-status.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as cache from '../lib/cache.js';
import * as errors from '../lib/errors.js';
import { run } from '../lib/cli/status.js';

let tmpDir;

// Capture console.log output during a run
async function captureRun(fn) {
  const output = [];
  const origLog = console.log;
  console.log = (...args) => output.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = origLog;
  }
  return output;
}

before(() => {
  tmpDir = join(tmpdir(), `cli-status-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cache.setCachePath(join(tmpDir, 'cache.json'));
  errors.setLogPath(join(tmpDir, 'errors.log'));
});

after(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('journey status', () => {
  it('runs without errors on empty state', async () => {
    await assert.doesNotReject(() => run(), 'run() should not throw on empty cache');
  });

  it('outputs the Journey Logger Status header', async () => {
    const output = await captureRun(run);
    const combined = output.join('\n');
    assert.ok(combined.includes('Journey Logger Status'), 'output should include status header');
  });

  it('shows entry count from cache', async () => {
    // Add two entries to the cache
    cache.recordSession('status-proj-a', '2026-03-25');
    cache.recordSession('status-proj-b', '2026-03-25');

    const output = await captureRun(run);
    const combined = output.join('\n');

    // getStats().totalEntries should be at least 2
    const stats = cache.getStats();
    assert.ok(combined.includes(String(stats.totalEntries)), `output should contain total entries count (${stats.totalEntries})`);
  });

  it('shows projects this week when entries exist', async () => {
    cache.recordSession('weekly-proj', '2026-03-25');

    const output = await captureRun(run);
    const combined = output.join('\n');

    // Should mention sessions across N projects
    assert.ok(combined.includes('sessions across'), 'output should include sessions-across summary');
  });

  it('shows pending sessions count line', async () => {
    // status.js reads from a hardcoded homedir path for sessions,
    // so we can only assert the line is present (count may be 0)
    const output = await captureRun(run);
    const combined = output.join('\n');
    assert.ok(combined.includes('Pending sessions'), 'output should include pending sessions line');
  });

  it('shows current streak line', async () => {
    const output = await captureRun(run);
    const combined = output.join('\n');
    assert.ok(combined.includes('Current streak'), 'output should include current streak line');
  });

  it('shows last capture time after an entry is logged', async () => {
    cache.recordSession('last-capture-proj', '2026-03-25');

    const output = await captureRun(run);
    const combined = output.join('\n');
    assert.ok(combined.includes('Last capture'), 'output should include last capture line after entries exist');
  });
});
