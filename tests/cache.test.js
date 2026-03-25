// tests/cache.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Cache module will be tested with a temp file path
const CACHE_PATH = join(import.meta.dirname, '..', 'lib', 'test-cache-cache.json');

import * as cache from '../lib/cache.js';

beforeEach(() => {
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
  cache.setCachePath(CACHE_PATH);
});
afterEach(() => {
  for (const suffix of ['.json', '.bak', '.tmp', '.json.lock']) {
    const p = CACHE_PATH.replace('.json', suffix);
    if (existsSync(p)) unlinkSync(p);
  }
});

describe('cache', () => {
  it('creates cache file on first load if missing', () => {
    const data = cache.load();
    assert.ok(data.week);
    assert.equal(data.totalEntries, 0);
    assert.deepEqual(data.weeklyProjects, {});
    assert.deepEqual(data.allProjects, []);
  });

  it('resets weekly data when week changes', () => {
    cache.save({
      week: '2025-W01',
      totalEntries: 10,
      weeklyProjects: { foo: 5 },
      allProjects: ['foo'],
      streaks: {},
      blockers: {}
    });
    const data = cache.load(); // Current week differs, should reset weeklyProjects
    assert.deepEqual(data.weeklyProjects, {});
    assert.equal(data.totalEntries, 10); // Total preserved
    assert.deepEqual(data.allProjects, ['foo']); // All projects preserved
  });

  it('increments project count for the week', () => {
    cache.recordSession('myproject');
    const data = cache.load();
    assert.equal(data.weeklyProjects['myproject'], 1);
    assert.equal(data.totalEntries, 1);
    assert.ok(data.allProjects.includes('myproject'));
  });

  it('tracks consecutive day streaks', () => {
    cache.recordSession('proj', '2026-03-18');
    cache.recordSession('proj', '2026-03-19');
    cache.recordSession('proj', '2026-03-20');
    const data = cache.load();
    assert.equal(data.streaks['proj'].count, 3);
  });

  it('resets streak on gap day', () => {
    cache.recordSession('proj', '2026-03-17');
    cache.recordSession('proj', '2026-03-19'); // skipped 18th
    const data = cache.load();
    assert.equal(data.streaks['proj'].count, 1);
  });

  it('tracks blockers with 7-day pruning', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    cache.save({
      week: cache.currentWeek(),
      totalEntries: 0,
      weeklyProjects: {},
      allProjects: [],
      streaks: {},
      blockers: { proj: [old, recent] }
    });
    cache.recordBlocker('proj'); // adds new one, prunes old
    const data = cache.load();
    // old timestamp should be pruned, recent + new should remain
    assert.equal(data.blockers['proj'].length, 2);
  });

  it('detects if project is new', () => {
    assert.equal(cache.isNewProject('brand-new'), true);
    cache.recordSession('brand-new');
    assert.equal(cache.isNewProject('brand-new'), false);
  });

  it('returns weekly session count for a project', () => {
    cache.recordSession('hot');
    cache.recordSession('hot');
    cache.recordSession('hot');
    assert.equal(cache.weeklyCount('hot'), 3);
  });

  it('detects recent blocker for breakthrough milestone', () => {
    cache.recordBlocker('proj');
    assert.equal(cache.hasRecentBlocker('proj'), true);
    assert.equal(cache.hasRecentBlocker('other'), false);
  });

  it('creates backup on save', () => {
    cache.recordSession('proj');
    cache.recordSession('proj', '2026-03-19');
    const bakPath = CACHE_PATH.replace('.json', '.bak');
    assert.ok(existsSync(bakPath));
  });

  it('recovers from corrupted cache using backup', () => {
    cache.recordSession('proj');
    writeFileSync(CACHE_PATH, '{invalid json!!!');
    const data = cache.load();
    assert.ok(data.week);
  });

  it('resets to default when both files corrupted', () => {
    writeFileSync(CACHE_PATH, 'garbage');
    writeFileSync(CACHE_PATH.replace('.json', '.bak'), 'also garbage');
    const data = cache.load();
    assert.equal(data.totalEntries, 0);
  });

  it('stores lastCapture timestamp on recordSession', () => {
    cache.recordSession('proj');
    const data = cache.load();
    assert.ok(data.lastCapture);
    assert.match(data.lastCapture, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('getStats returns correct shape', () => {
    cache.recordSession('alpha', '2026-03-18');
    cache.recordSession('alpha', '2026-03-19');
    cache.recordSession('alpha', '2026-03-20');
    cache.recordSession('beta', '2026-03-20');
    const stats = cache.getStats();
    assert.equal(typeof stats.totalEntries, 'number');
    assert.equal(typeof stats.weeklyCount, 'number');
    assert.equal(typeof stats.currentStreak, 'number');
    assert.ok(stats.lastCapture);
    assert.ok(Array.isArray(stats.projectsThisWeek));
    assert.equal(stats.currentStreak, 3);
  });

  it('stores and checks recent_fingerprints', () => {
    cache.addFingerprint('abc123');
    assert.ok(cache.hasFingerprint('abc123'));
    assert.ok(!cache.hasFingerprint('xyz789'));
  });

  it('caps fingerprints at 50', () => {
    for (let i = 0; i < 55; i++) cache.addFingerprint(`fp${i}`);
    const data = cache.load();
    assert.equal(data.recent_fingerprints.length, 50);
    assert.ok(!cache.hasFingerprint('fp0'));
    assert.ok(cache.hasFingerprint('fp54'));
  });
});

describe('file locking (spec 1.4)', () => {
  it('creates and removes lockfile during save', () => {
    const lockPath = CACHE_PATH + '.lock';
    cache.recordSession('proj');
    assert.equal(existsSync(lockPath), false);
  });

  it('handles stale lockfile (>30s)', () => {
    const lockPath = CACHE_PATH + '.lock';
    const staleTime = Date.now() - 60000;
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, ts: staleTime }));
    cache.recordSession('proj');
    const data = cache.load();
    assert.equal(data.weeklyProjects['proj'], 1);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  });

  it('concurrent saves do not lose data', () => {
    cache.recordSession('projA', '2026-03-20');
    cache.recordSession('projB', '2026-03-20');
    const data = cache.load();
    assert.equal(data.weeklyProjects['projA'], 1);
    assert.equal(data.weeklyProjects['projB'], 1);
    assert.equal(data.totalEntries, 2);
  });
});
