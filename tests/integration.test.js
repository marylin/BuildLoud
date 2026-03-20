// tests/integration.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';
import * as md from '../lib/markdown.js';
import * as writeEntry from '../lib/write-entry.js';
import * as seoFeed from '../lib/seo-feed.js';

const TEST_DIR = join(import.meta.dirname, 'test-integration');
const CACHE_PATH = join(import.meta.dirname, 'test-int-cache.json');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
  mkdirSync(TEST_DIR, { recursive: true });
  cache.setCachePath(CACHE_PATH);
  md.setBasePath(TEST_DIR);
  writeEntry.setOptions({ skipGit: true, skipSupabase: true, skipSeo: true });
  seoFeed.setConfig({
    whateverai_projects: [],
    default_tenant: 'test',
    seo_score_threshold: 7,
    digest_score_threshold: 5
  });
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
});

describe('integration: full write pipeline', () => {
  it('writes a manual insight entry end-to-end', async () => {
    const result = await writeEntry.write({
      project: 'myproject',
      type: 'insight',
      source: 'manual_journal',
      summary: 'Key insight: caching beats network calls every time.'
    }, new Date('2026-03-20T14:30:00Z'));

    // Check score (insight=3 + manual=3 + phrase=1 + new_project notable=2 = 9)
    assert.ok(result.score >= 7, `Expected score >= 7, got ${result.score}`);
    assert.ok(result.milestones.includes('new_project'));
    assert.ok(result.notable);

    // Check markdown was written
    const mdPath = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    assert.ok(existsSync(mdPath));
    const content = readFileSync(mdPath, 'utf8');
    assert.ok(content.includes('[insight]'));
    assert.ok(content.includes('[manual]'));
    assert.ok(content.includes('⭐'));
    assert.ok(content.includes('caching beats network calls'));

    // Check cache was updated
    assert.equal(cache.weeklyCount('myproject'), 1);
    assert.equal(cache.isNewProject('myproject'), false); // no longer new
  });

  it('writes multiple entries and tracks milestones correctly', async () => {
    // Entry 1: new project
    const r1 = await writeEntry.write({
      project: 'proj', type: 'feature', source: 'stop_hook', summary: 'Started.'
    }, new Date('2026-03-18T10:00:00Z'));
    assert.ok(r1.milestones.includes('new_project'));

    // Entry 2: blocker
    await writeEntry.write({
      project: 'proj', type: 'blocker', source: 'manual_journal', summary: 'Stuck on auth.'
    }, new Date('2026-03-19T10:00:00Z'));

    // Entry 3: breakthrough (bugfix after blocker)
    // At detection time, streak count is 2 (entries 1+2), so persistence not yet triggered
    const r3 = await writeEntry.write({
      project: 'proj', type: 'bugfix', source: 'stop_hook', summary: 'Fixed auth.'
    }, new Date('2026-03-20T10:00:00Z'));
    assert.ok(r3.milestones.includes('breakthrough'));

    // Entry 4: persistence fires on day 4 (streak reaches 3 after entry 3 recorded)
    const r4 = await writeEntry.write({
      project: 'proj', type: 'feature', source: 'stop_hook', summary: 'Polished UI.'
    }, new Date('2026-03-21T10:00:00Z'));
    assert.ok(r4.milestones.includes('persistence')); // 4 consecutive days, streak count >= 3
  });
});
