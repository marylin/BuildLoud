// tests/supabase.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const QUEUE_PATH = join(import.meta.dirname, 'test-pending-sync.jsonl');

let supabase;
beforeEach(async () => {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
  supabase = await import('../lib/supabase.js');
  supabase.setQueuePath(QUEUE_PATH);
});
afterEach(() => {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
  mock.restoreAll();
});

describe('buildPayload', () => {
  it('converts entry to Supabase row format', () => {
    const entry = {
      project: 'test', type: 'feature', source: 'stop_hook',
      summary: 'Built something', notable: false, social_score: 3,
      tags: ['test'], metadata: { branch: 'main' }
    };
    const payload = supabase.buildPayload(entry);
    assert.equal(payload.project, 'test');
    assert.equal(payload.type, 'feature');
    assert.equal(payload.social_score, 3);
    assert.ok(payload.tags);
  });
});

describe('retry queue', () => {
  it('enqueues failed entry to JSONL file', () => {
    const entry = { project: 'test', type: 'feature', source: 'stop_hook', summary: 'x' };
    supabase.enqueue(entry);
    const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.project, 'test');
  });

  it('reads pending queue', () => {
    supabase.enqueue({ project: 'a', type: 'feature', source: 'stop_hook', summary: 'x' });
    supabase.enqueue({ project: 'b', type: 'bugfix', source: 'stop_hook', summary: 'y' });
    const pending = supabase.readQueue();
    assert.equal(pending.length, 2);
  });

  it('drops entries older than 7 days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    writeFileSync(QUEUE_PATH,
      JSON.stringify({ project: 'old', _queued_at: old }) + '\n' +
      JSON.stringify({ project: 'recent', _queued_at: recent }) + '\n'
    );
    const pending = supabase.readQueue();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].project, 'recent');
  });

  it('warns when queue exceeds 50 entries', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    for (let i = 0; i < 51; i++) {
      supabase.enqueue({ project: `p${i}`, type: 'feature', source: 'stop_hook', summary: 'x' });
    }
    supabase.readQueue(); // triggers warning
    console.warn = origWarn;
    assert.ok(warnings.some(w => w.includes('50')));
  });

  it('clears queue after successful processing', () => {
    supabase.enqueue({ project: 'a', type: 'feature', source: 'stop_hook', summary: 'x' });
    supabase.clearQueue();
    assert.equal(existsSync(QUEUE_PATH), false);
  });
});
