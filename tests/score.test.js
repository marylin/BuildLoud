// tests/score.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';

const CACHE_PATH = join(import.meta.dirname, '..', 'lib', 'test-cache.json');

beforeEach(() => {
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
  cache.setCachePath(CACHE_PATH);
  // Pre-register 'proj' so it's not treated as a new project in generic tests
  // Use load/save directly to avoid side effects on streaks and counts
  const data = cache.load();
  if (!data.allProjects.includes('proj')) data.allProjects.push('proj');
  cache.save(data);
});
afterEach(() => {
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
});

import * as score from '../lib/score.js';

describe('computeScore', () => {
  it('scores a basic auto bugfix at 1', () => {
    const entry = { type: 'bugfix', source: 'stop_hook', summary: 'Fixed a null check', project: 'proj' };
    assert.equal(score.computeScore(entry), 1);
  });

  it('scores manual insight at 6', () => {
    const entry = { type: 'insight', source: 'manual_journal', summary: 'Pattern found', project: 'proj' };
    assert.equal(score.computeScore(entry), 6); // 3 (insight) + 3 (manual)
  });

  it('adds +1 for key insight phrases', () => {
    const entry = { type: 'feature', source: 'stop_hook', summary: 'Key insight: caching helps', project: 'proj' };
    assert.equal(score.computeScore(entry), 3); // 2 (feature) + 1 (phrase)
  });

  it('adds +2 for new project mention', () => {
    const entry = { type: 'feature', source: 'stop_hook', summary: 'Built something', project: 'brand-new' };
    const s = score.computeScore(entry);
    assert.equal(s, 4); // 2 (feature) + 2 (new project)
  });

  it('adds +1 for hot project (3+ sessions this week)', () => {
    cache.recordSession('hot');
    cache.recordSession('hot');
    cache.recordSession('hot');
    const entry = { type: 'feature', source: 'stop_hook', summary: 'More work', project: 'hot' };
    assert.equal(score.computeScore(entry), 3); // 2 (feature) + 1 (hot)
  });

  it('caps score at 10', () => {
    cache.recordSession('hot');
    cache.recordSession('hot');
    cache.recordSession('hot');
    // milestone + manual + notable + new project + phrase + hot = 4+3+2+2+1+1 = 13 → capped at 10
    const entry = {
      type: 'milestone', source: 'manual_journal',
      summary: 'Key insight: amazing new tool built', project: 'newproj',
      notable: true
    };
    assert.ok(score.computeScore(entry) <= 10);
  });
});

describe('detectMilestones', () => {
  it('detects new project milestone', () => {
    const entry = { project: 'never-seen', type: 'feature' };
    const milestones = score.detectMilestones(entry);
    assert.ok(milestones.includes('new_project'));
  });

  it('does not flag existing project as new', () => {
    cache.recordSession('existing');
    const entry = { project: 'existing', type: 'feature' };
    const milestones = score.detectMilestones(entry);
    assert.ok(!milestones.includes('new_project'));
  });

  it('detects persistence milestone (3+ day streak)', () => {
    cache.recordSession('proj', '2026-03-18');
    cache.recordSession('proj', '2026-03-19');
    cache.recordSession('proj', '2026-03-20');
    const entry = { project: 'proj', type: 'feature' };
    const milestones = score.detectMilestones(entry);
    assert.ok(milestones.includes('persistence'));
  });

  it('detects breakthrough after recent blocker', () => {
    cache.recordBlocker('proj');
    const entry = { project: 'proj', type: 'bugfix' };
    const milestones = score.detectMilestones(entry);
    assert.ok(milestones.includes('breakthrough'));
  });

  it('detects shipped milestone on PR merge with 5+ prior entries', () => {
    for (let i = 0; i < 5; i++) cache.recordSession('proj');
    const entry = { project: 'proj', type: 'feature', source: 'pr_hook', metadata: { action: 'merged' } };
    const milestones = score.detectMilestones(entry);
    assert.ok(milestones.includes('shipped'));
  });

  it('does not flag shipped for project with < 5 entries', () => {
    cache.recordSession('proj');
    const entry = { project: 'proj', type: 'feature', source: 'pr_hook', metadata: { action: 'merged' } };
    const milestones = score.detectMilestones(entry);
    assert.ok(!milestones.includes('shipped'));
  });

  it('detects volume milestones', () => {
    // Manually set totalEntries to 9
    const data = cache.load();
    data.totalEntries = 9;
    cache.save(data);
    cache.recordSession('proj'); // This makes it 10
    const entry = { project: 'proj', type: 'feature' };
    const milestones = score.detectMilestones(entry);
    assert.ok(milestones.includes('volume_10'));
  });
});
