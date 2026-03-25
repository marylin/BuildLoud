// tests/db.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE_PATH = join(import.meta.dirname, 'test-pending-sync.jsonl');

let db;
beforeEach(async () => {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
  db = await import('../lib/db.js');
  db.setQueuePath(QUEUE_PATH);
});
afterEach(() => {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
  const TMP_PATH = QUEUE_PATH + '.tmp';
  if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  mock.restoreAll();
});

describe('buildPayload', () => {
  it('converts entry to DB row format', () => {
    const entry = {
      project: 'test', type: 'feature', source: 'stop_hook',
      summary: 'Built something', notable: false, social_score: 3,
      tags: ['test'], metadata: { branch: 'main' }
    };
    const payload = db.buildPayload(entry);
    assert.equal(payload.project, 'test');
    assert.equal(payload.type, 'feature');
    assert.equal(payload.social_score, 3);
    assert.ok(payload.tags);
  });
});

describe('retry queue', () => {
  it('enqueues failed entry to JSONL file', () => {
    const entry = { project: 'test', type: 'feature', source: 'stop_hook', summary: 'x' };
    db.enqueue(entry);
    const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.project, 'test');
  });

  it('reads pending queue', () => {
    db.enqueue({ project: 'a', type: 'feature', source: 'stop_hook', summary: 'x' });
    db.enqueue({ project: 'b', type: 'bugfix', source: 'stop_hook', summary: 'y' });
    const pending = db.readQueue();
    assert.equal(pending.length, 2);
  });

  it('drops entries older than 7 days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    writeFileSync(QUEUE_PATH,
      JSON.stringify({ project: 'old', _queued_at: old }) + '\n' +
      JSON.stringify({ project: 'recent', _queued_at: recent }) + '\n'
    );
    const pending = db.readQueue();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].project, 'recent');
  });

  it('warns when queue exceeds 50 entries', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    for (let i = 0; i < 51; i++) {
      db.enqueue({ project: `p${i}`, type: 'feature', source: 'stop_hook', summary: 'x' });
    }
    db.readQueue(); // triggers warning
    console.warn = origWarn;
    assert.ok(warnings.some(w => w.includes('50')));
  });

  it('clears queue after successful processing', () => {
    db.enqueue({ project: 'a', type: 'feature', source: 'stop_hook', summary: 'x' });
    db.clearQueue();
    assert.equal(existsSync(QUEUE_PATH), false);
  });
});

describe('getQueueStats', () => {
  it('returns zeros when no queue file', () => {
    const stats = db.getQueueStats();
    assert.deepEqual(stats, { pending: 0, oldest: null, newest: null });
  });

  it('returns correct stats for populated queue', () => {
    const ts1 = '2026-03-20T10:00:00Z';
    const ts2 = '2026-03-21T10:00:00Z';
    writeFileSync(QUEUE_PATH,
      JSON.stringify({ project: 'a', _queued_at: ts1 }) + '\n' +
      JSON.stringify({ project: 'b', _queued_at: ts2 }) + '\n'
    );
    const stats = db.getQueueStats();
    assert.equal(stats.pending, 2);
    assert.equal(stats.oldest, ts1);
    assert.equal(stats.newest, ts2);
  });
});

describe('atomic queue rewrite (spec 1.3)', () => {
  it('source uses .tmp file for queue rewrite', async () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'db.js'), 'utf8');
    assert.ok(source.includes('.tmp'), 'Should use .tmp file for atomic rewrite');
    assert.ok(source.includes('renameSync'), 'Should rename .tmp to queue file');
  });

  it('recovers orphaned .tmp file when main queue missing', () => {
    const TMP_PATH = QUEUE_PATH + '.tmp';
    writeFileSync(TMP_PATH,
      JSON.stringify({ project: 'orphan', _queued_at: new Date().toISOString(), type: 'feature', source: 'stop_hook', summary: 'x' }) + '\n'
    );
    const pending = db.readQueue();
    assert.ok(pending.length >= 1);
    assert.ok(pending.some(e => e.project === 'orphan'));
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  });

  it('merges orphaned .tmp with existing queue', () => {
    const TMP_PATH = QUEUE_PATH + '.tmp';
    db.enqueue({ project: 'existing', type: 'feature', source: 'stop_hook', summary: 'x' });
    writeFileSync(TMP_PATH,
      JSON.stringify({ project: 'orphan', _queued_at: new Date().toISOString(), type: 'feature', source: 'stop_hook', summary: 'y' }) + '\n'
    );
    const pending = db.readQueue();
    assert.ok(pending.some(e => e.project === 'existing'));
    assert.ok(pending.some(e => e.project === 'orphan'));
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  });
});
