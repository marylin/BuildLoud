// tests/cli-doctor.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';
import * as db from '../lib/db.js';

const TEST_DIR = join(import.meta.dirname, 'test-doctor');
const CACHE_PATH = join(TEST_DIR, 'cache.json');
const QUEUE_PATH = join(TEST_DIR, 'pending-sync.jsonl');

let doctor;
beforeEach(async () => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  cache.setCachePath(CACHE_PATH);
  db.setQueuePath(QUEUE_PATH);
  doctor = await import('../lib/cli/doctor.js');
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('journey doctor', () => {
  it('exports a run function', () => {
    assert.equal(typeof doctor.run, 'function');
  });

  it('runs without crashing when no env vars set', async () => {
    const saved = { DB: process.env.DATABASE_URL, API: process.env.ANTHROPIC_API_KEY };
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    await doctor.run([]);
    console.log = origLog;
    assert.ok(logs.length > 0);
    if (saved.DB) process.env.DATABASE_URL = saved.DB;
    if (saved.API) process.env.ANTHROPIC_API_KEY = saved.API;
  });

  it('reports queue status', async () => {
    db.enqueue({ project: 'test', type: 'feature', source: 'stop_hook', summary: 'x' });
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    await doctor.run([]);
    console.log = origLog;
    assert.ok(logs.some(l => l.includes('Queue') || l.includes('pending')));
  });
});
