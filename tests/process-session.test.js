// tests/process-session.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as cache from '../lib/cache.js';
import { processSession } from '../lib/cli/process-session.js';

let tmpDir;

before(() => {
  tmpDir = join(tmpdir(), `process-session-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  cache.setCachePath(join(tmpDir, 'cache.json'));
});

after(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeSession(name, lines) {
  const filePath = join(tmpDir, name);
  writeFileSync(filePath, lines.join('\n') + '\n');
  return filePath;
}

describe('processSession', () => {
  it('returns scored entry for a single-project session with 3 commits', () => {
    const filePath = writeSession('single-project.jsonl', [
      JSON.stringify({ ts: '2026-03-25T10:00:00Z', project: 'alpha', message: 'feat: add login', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T10:05:00Z', project: 'alpha', message: 'feat: add logout', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T10:10:00Z', project: 'alpha', message: 'fix: null check', type: 'fix' }),
    ]);

    const results = processSession(filePath);

    assert.equal(results.length, 1);
    const entry = results[0];
    assert.equal(entry.project, 'alpha');
    assert.equal(typeof entry.type, 'string');
    assert.equal(typeof entry.score, 'number');
    assert.ok(Array.isArray(entry.commits));
    assert.equal(entry.commits.length, 3);
    assert.equal(typeof entry.raw_summary, 'string');
    assert.ok(entry.raw_summary.length > 0);
  });

  it('entry has all required fields', () => {
    const filePath = writeSession('fields-check.jsonl', [
      JSON.stringify({ ts: '2026-03-25T11:00:00Z', project: 'beta', message: 'refactor: cleanup', type: 'refactor' }),
    ]);

    const results = processSession(filePath);
    assert.equal(results.length, 1);
    const entry = results[0];

    assert.ok('project' in entry, 'missing project');
    assert.ok('type' in entry, 'missing type');
    assert.ok('score' in entry, 'missing score');
    assert.ok('commits' in entry, 'missing commits');
    assert.ok('raw_summary' in entry, 'missing raw_summary');
    assert.ok('milestones' in entry, 'missing milestones');
    assert.ok('notable' in entry, 'missing notable');
    assert.ok('notables' in entry, 'missing notables');
    assert.ok('dateStr' in entry, 'missing dateStr');

    assert.ok(entry.score >= 0 && entry.score <= 10, `score out of range: ${entry.score}`);
    assert.ok(Array.isArray(entry.milestones));
    assert.equal(typeof entry.notable, 'boolean');
  });

  it('returns 2 entries for commits from 2 different projects', () => {
    const filePath = writeSession('two-projects.jsonl', [
      JSON.stringify({ ts: '2026-03-25T12:00:00Z', project: 'proj-x', message: 'feat: feature A', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T12:01:00Z', project: 'proj-y', message: 'fix: bug B', type: 'fix' }),
      JSON.stringify({ ts: '2026-03-25T12:02:00Z', project: 'proj-x', message: 'chore: cleanup', type: 'chore' }),
    ]);

    const results = processSession(filePath);
    assert.equal(results.length, 2);
    const projects = results.map(r => r.project).sort();
    assert.deepEqual(projects, ['proj-x', 'proj-y']);
  });

  it('returns [] for an empty file', () => {
    const filePath = join(tmpDir, 'empty.jsonl');
    writeFileSync(filePath, '');
    const results = processSession(filePath);
    assert.deepEqual(results, []);
  });

  it('returns [] for a file with only malformed JSON lines', () => {
    const filePath = writeSession('malformed.jsonl', [
      'not-json',
      '{broken',
      ',,,,',
    ]);
    const results = processSession(filePath);
    assert.deepEqual(results, []);
  });

  it('skips malformed lines and processes valid ones', () => {
    const filePath = writeSession('mixed-validity.jsonl', [
      'not valid json at all',
      JSON.stringify({ ts: '2026-03-25T13:00:00Z', project: 'gamma', message: 'feat: valid commit', type: 'feat' }),
      '{incomplete',
    ]);

    const results = processSession(filePath);
    assert.equal(results.length, 1);
    assert.equal(results[0].project, 'gamma');
  });

  it('deduplicates identical sessions on second call', () => {
    const filePath = writeSession('dedup.jsonl', [
      JSON.stringify({ ts: '2026-03-25T14:00:00Z', project: 'dedup-proj', message: 'feat: unique work', type: 'feat' }),
    ]);

    const first = processSession(filePath);
    assert.equal(first.length, 1);

    const second = processSession(filePath);
    assert.equal(second.length, 0, 'duplicate session should be skipped');
  });

  it('strips conventional commit prefix from raw_summary', () => {
    const filePath = writeSession('prefix-strip.jsonl', [
      JSON.stringify({ ts: '2026-03-25T15:00:00Z', project: 'prefix-proj', message: 'feat(auth): add oauth flow', type: 'feat' }),
    ]);

    const results = processSession(filePath);
    assert.equal(results.length, 1);
    assert.equal(results[0].raw_summary, 'add oauth flow');
  });

  it('marks type as milestone when pr_merged notable event is present', () => {
    const filePath = writeSession('pr-merge.jsonl', [
      JSON.stringify({ ts: '2026-03-25T16:00:00Z', project: 'ship-proj', message: 'feat: final feature', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T16:01:00Z', project: 'ship-proj', type: 'pr_merged' }),
    ]);

    const results = processSession(filePath);
    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'milestone');
  });

  it('builds summary correctly for 1, 2-3, and 4+ commits', () => {
    // 1 commit
    const f1 = writeSession('summary-1.jsonl', [
      JSON.stringify({ ts: '2026-03-25T17:00:00Z', project: 'sum1', message: 'feat: only one', type: 'feat' }),
    ]);
    const r1 = processSession(f1);
    assert.equal(r1[0].raw_summary, 'only one');

    // 2 commits
    const f2 = writeSession('summary-2.jsonl', [
      JSON.stringify({ ts: '2026-03-25T17:01:00Z', project: 'sum2', message: 'feat: first', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T17:02:00Z', project: 'sum2', message: 'feat: second', type: 'feat' }),
    ]);
    const r2 = processSession(f2);
    assert.equal(r2[0].raw_summary, 'first, second');

    // 4 commits (triggers "and N more")
    const f4 = writeSession('summary-4.jsonl', [
      JSON.stringify({ ts: '2026-03-25T17:03:00Z', project: 'sum4', message: 'feat: one', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T17:04:00Z', project: 'sum4', message: 'feat: two', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T17:05:00Z', project: 'sum4', message: 'feat: three', type: 'feat' }),
      JSON.stringify({ ts: '2026-03-25T17:06:00Z', project: 'sum4', message: 'feat: four', type: 'feat' }),
    ]);
    const r4 = processSession(f4);
    assert.equal(r4[0].raw_summary, 'one, two, and 2 more');
  });
});
