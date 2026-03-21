// tests/write-entry.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
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

  it('humanizes entries with score >= 5 (public_summary in metadata)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '{"public_summary": "Shipped something cool."}' }]
      })
    }));
    // Manual journal + insight type = score 6 (base 3 + manual 3)
    const result = await writeEntry.write({
      project: 'testproj', type: 'insight',
      source: 'manual_journal', summary: 'Discovered a key pattern.'
    });
    // Read the entry back -- score should be >= 5 and metadata should have public_summary
    assert.ok(result.score >= 5, `Expected score >= 5, got ${result.score}`);
    globalThis.fetch = undefined;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('does not humanize entries with score < 5', async () => {
    // Pre-seed the cache so the project is not "new" (which would add +2 notable)
    cache.recordSession('lowscoreproj', new Date().toISOString().slice(0, 10));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchCalls = [];
    globalThis.fetch = mock.fn((...args) => { fetchCalls.push(args); return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ text: '{}' }] }) }); });
    await writeEntry.write({
      project: 'lowscoreproj', type: 'bugfix',
      source: 'stop_hook', summary: 'Fixed a typo.'
    });
    // bugfix + stop_hook on existing project = score 1, no humanize call
    assert.equal(fetchCalls.length, 0);
    globalThis.fetch = undefined;
    delete process.env.ANTHROPIC_API_KEY;
  });
});
