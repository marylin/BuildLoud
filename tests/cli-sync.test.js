// tests/cli-sync.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as markdown from '../lib/markdown.js';
import * as db from '../lib/db.js';

const TMP = join(import.meta.dirname, 'tmp-sync');
const QUEUE_PATH = join(TMP, 'pending-sync.jsonl');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  markdown.setBasePath(TMP);
  db.setQueuePath(QUEUE_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('countLocalEntries', () => {
  it('counts entry headers in markdown files', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n## 10:00 — proj [feature]\nFirst entry\n\n## 14:00 — proj [bugfix]\nSecond entry\n');
    const { countLocalEntries } = await import('../lib/cli/sync.js');
    const count = countLocalEntries(TMP);
    assert.equal(count, 2);
  });

  it('returns 0 when no markdown files', async () => {
    const { countLocalEntries } = await import('../lib/cli/sync.js');
    const count = countLocalEntries(TMP);
    assert.equal(count, 0);
  });
});

describe('pullEntry', () => {
  it('writes DB entries to local markdown', async () => {
    const { pullEntry } = await import('../lib/cli/sync.js');
    const dbRow = {
      project: 'test-proj', type: 'feature', source: 'stop_hook',
      summary: 'Built something great', social_score: 3,
      created_at: '2026-03-21T10:30:00Z', metadata: {}
    };
    pullEntry(dbRow, TMP);
    const filePath = join(TMP, '2026', '03', '2026-03-21.md');
    assert.ok(existsSync(filePath));
    const content = readFileSync(filePath, 'utf8');
    assert.match(content, /Built something great/);
  });

  it('skips entry if already exists locally', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n## 10:30 — test-proj [feature]\nBuilt something great\n');
    const { pullEntry } = await import('../lib/cli/sync.js');
    const dbRow = {
      project: 'test-proj', type: 'feature', source: 'stop_hook',
      summary: 'Built something great', social_score: 3,
      created_at: '2026-03-21T10:30:00Z', metadata: {}
    };
    const result = pullEntry(dbRow, TMP);
    assert.equal(result, false);
  });
});

describe('sync push', () => {
  it('reads pending queue entries', async () => {
    db.enqueue({ project: 'test', type: 'feature', source: 'stop_hook', summary: 'queued' });
    const stats = db.getQueueStats();
    assert.equal(stats.pending, 1);
  });
});

describe('sync status output', () => {
  it('reports local and queue counts', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n## 10:00 — proj [feature]\nEntry\n');
    db.enqueue({ project: 'q', type: 'feature', source: 'stop_hook', summary: 'x' });
    const { countLocalEntries } = await import('../lib/cli/sync.js');
    assert.equal(countLocalEntries(TMP), 1);
    assert.equal(db.getQueueStats().pending, 1);
  });
});

describe('pullEntry null guards (spec 1.5)', () => {
  it('handles null summary without crashing', async () => {
    const { pullEntry } = await import('../lib/cli/sync.js');
    const row = {
      created_at: '2026-03-20T10:00:00Z',
      project: 'test', type: 'feature', source: 'stop_hook',
      summary: null, social_score: 3, metadata: {}
    };
    const result = pullEntry(row, TMP);
    assert.equal(typeof result, 'boolean');
  });

  it('handles null metadata without crashing', async () => {
    const { pullEntry } = await import('../lib/cli/sync.js');
    const row = {
      created_at: '2026-03-20T10:00:00Z',
      project: 'test', type: 'feature', source: 'stop_hook',
      summary: 'valid summary', social_score: 3, metadata: null
    };
    const result = pullEntry(row, TMP);
    assert.equal(typeof result, 'boolean');
  });

  it('skips entry with null created_at', async () => {
    const { pullEntry } = await import('../lib/cli/sync.js');
    const row = {
      created_at: null,
      project: 'test', type: 'feature', source: 'stop_hook',
      summary: 'valid', social_score: 3, metadata: {}
    };
    const result = pullEntry(row, TMP);
    assert.equal(result, false);
  });
});
