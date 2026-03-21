// tests/write-entry.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';
import * as md from '../lib/markdown.js';
import * as writeEntry from '../lib/write-entry.js';

const TEST_DIR = join(import.meta.dirname, 'test-orchestrator');
const CACHE_PATH = join(import.meta.dirname, 'test-orch-cache.json');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
  mkdirSync(TEST_DIR, { recursive: true });
  cache.setCachePath(CACHE_PATH);
  md.setBasePath(TEST_DIR);
  writeEntry.setOptions({ skipGit: true, skipDb: true, skipSeo: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
});

describe('write-entry orchestrator', () => {
  it('writes a complete entry and returns result', async () => {
    const result = await writeEntry.write({
      project: 'testproj',
      type: 'feature',
      source: 'stop_hook',
      summary: 'Built the auth module.'
    });
    assert.ok(result.markdownPath);
    assert.equal(typeof result.score, 'number');
    assert.ok(Array.isArray(result.milestones));
  });

  it('updates cache after writing', async () => {
    await writeEntry.write({
      project: 'testproj', type: 'feature',
      source: 'stop_hook', summary: 'First entry.'
    });
    assert.equal(cache.weeklyCount('testproj'), 1);
    const data = cache.load();
    assert.equal(data.totalEntries, 1);
  });

  it('records blocker in cache when type is blocker', async () => {
    await writeEntry.write({
      project: 'testproj', type: 'blocker',
      source: 'manual_journal', summary: 'Stuck on X.'
    });
    assert.ok(cache.hasRecentBlocker('testproj'));
  });

  it('detects milestones and sets notable flag', async () => {
    const result = await writeEntry.write({
      project: 'never-seen-before', type: 'feature',
      source: 'stop_hook', summary: 'New project!'
    });
    assert.ok(result.milestones.includes('new_project'));
  });
});
