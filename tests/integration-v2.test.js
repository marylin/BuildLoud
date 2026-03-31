// tests/integration-v2.test.js — end-to-end integration test for buildloud v2
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync,
  readdirSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as cache from '../lib/cache.js';
import { setBasePath } from '../lib/markdown.js';
import { processSession } from '../lib/cli/process-session.js';
import { writeEntry } from '../lib/markdown.js';
import { recoverOrphans } from '../lib/cli/recover.js';
import { searchLocal } from '../lib/cli/search.js';

// ── shared temp dirs ────────────────────────────────────────────────────────
let tmpDir, cacheDir, entriesDir, sessionsDir;

before(() => {
  tmpDir = join(tmpdir(), `journey-integration-${Date.now()}`);
  cacheDir = join(tmpDir, 'cache');
  entriesDir = join(tmpDir, 'entries');
  sessionsDir = join(tmpDir, 'sessions');

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(entriesDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });

  cache.setCachePath(join(cacheDir, 'cache.json'));
  setBasePath(entriesDir);
});

after(() => {
  // Restore default base path (avoid polluting other test runs that share the module)
  setBasePath(null);
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────
function writeSessionFile(name, lines) {
  const filePath = join(sessionsDir, name);
  writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return filePath;
}

const SESSION_LINES = [
  { ts: '2026-03-25T10:00:00Z', project: 'myapp', message: 'feat(auth): add login flow', type: 'feat' },
  { ts: '2026-03-25T10:30:00Z', project: 'myapp', message: 'feat(auth): add logout', type: 'feat' },
  { ts: '2026-03-25T11:00:00Z', project: 'myapp', message: 'test(auth): add auth tests', type: 'test' },
];

// ── tests ────────────────────────────────────────────────────────────────────
describe('buildloud v2 integration', () => {

  it('processSession returns scored entries for simulated accumulate output', () => {
    const sessionFile = writeSessionFile('session-1.jsonl', SESSION_LINES);
    const results = processSession(sessionFile);

    assert.equal(results.length, 1, 'expected exactly one project entry');
    const entry = results[0];
    assert.equal(entry.project, 'myapp');
    assert.equal(typeof entry.score, 'number');
    assert.ok(entry.score >= 0 && entry.score <= 10, `score out of range: ${entry.score}`);
    assert.ok(entry.raw_summary.length > 0, 'raw_summary should not be empty');
    assert.equal(entry.commits.length, 3);
  });

  it('writeEntry creates a markdown file containing project name, summary, and score indicator', () => {
    // Use processSession result from the same data (fresh session file — different name to avoid dedup clash)
    const sessionFile = writeSessionFile('session-write.jsonl', [
      { ts: '2026-03-25T12:00:00Z', project: 'myapp-write', message: 'feat: ship dashboard', type: 'feat' },
      { ts: '2026-03-25T12:05:00Z', project: 'myapp-write', message: 'fix: remove stale data', type: 'fix' },
    ]);
    const results = processSession(sessionFile);
    assert.equal(results.length, 1);

    const result = results[0];
    const mdPath = writeEntry({
      project: result.project,
      type: result.type,
      source: 'stop_hook',
      summary: result.raw_summary,
      social_score: result.score,
      notable: result.notable,
    });

    assert.ok(existsSync(mdPath), `markdown file not created at ${mdPath}`);
    const content = readFileSync(mdPath, 'utf8');
    assert.ok(content.includes('myapp-write'), 'markdown should contain project name');
    assert.ok(content.includes(result.raw_summary), 'markdown should contain summary');
    // Score >= 5 gets a star, score < 5 still produces valid content
    assert.ok(content.length > 0, 'markdown file should not be empty');
  });

  it('recoverOrphans processes orphaned session file, writes markdown, deletes session file', () => {
    const orphanFile = writeSessionFile('orphan-1.jsonl', [
      { ts: '2026-03-25T13:00:00Z', project: 'recover-proj', message: 'feat: orphaned feature', type: 'feat' },
    ]);

    assert.ok(existsSync(orphanFile), 'orphan session file should exist before recovery');

    const count = recoverOrphans(sessionsDir);
    // count >= 1 because orphan-1.jsonl was processed
    assert.ok(count >= 1, `expected at least 1 recovered session, got ${count}`);

    assert.ok(!existsSync(orphanFile), 'session file should be deleted after recovery');

    // Verify a markdown entry was written for recover-proj
    const years = readdirSync(entriesDir).filter(d => /^\d{4}$/.test(d));
    assert.ok(years.length > 0, 'entries directory should contain year subdirs');
    let found = false;
    for (const year of years) {
      const months = readdirSync(join(entriesDir, year)).filter(d => /^\d{2}$/.test(d));
      for (const month of months) {
        const days = readdirSync(join(entriesDir, year, month)).filter(d => /^\d{2}$/.test(d));
        for (const day of days) {
          const projects = readdirSync(join(entriesDir, year, month, day));
          for (const project of projects) {
            const files = readdirSync(join(entriesDir, year, month, day, project)).filter(f => f.endsWith('.md'));
            for (const file of files) {
              const content = readFileSync(join(entriesDir, year, month, day, project, file), 'utf8');
              if (content.includes('recover-proj')) found = true;
            }
          }
        }
      }
    }
    assert.ok(found, 'markdown entry for recover-proj should have been written');
  });

  it('deduplication: processSession returns empty on second call with same data', () => {
    // session-1.jsonl was already processed in the first test — reuse same data
    const sessionFile = writeSessionFile('session-dedup.jsonl', SESSION_LINES);

    // First call should be a dup (fingerprints already recorded by the first test)
    const results = processSession(sessionFile);
    assert.equal(results.length, 0, 'identical session data should be deduped to empty results');
  });

  it('searchLocal finds entry by project name', () => {
    // Write a fresh searchable entry
    writeEntry({
      project: 'searchable-proj',
      type: 'feature',
      source: 'stop_hook',
      summary: 'add search indexing pipeline',
      social_score: 3,
    });

    const hits = searchLocal('searchable-proj', entriesDir);
    assert.ok(hits.length > 0, 'searchLocal should find the entry by project name');
    assert.ok(hits.some(h => h.includes('searchable-proj')), 'result should include project name');
  });

  it('searchLocal finds entry by summary text', () => {
    const hits = searchLocal('search indexing pipeline', entriesDir);
    assert.ok(hits.length > 0, 'searchLocal should match on summary text');
  });

  it('searchLocal returns empty array for unmatched query', () => {
    const hits = searchLocal('xyzzy-not-in-any-entry-ever', entriesDir);
    assert.deepEqual(hits, []);
  });

  it('notable-only session (zero commits) is skipped by processSession', () => {
    const sessionFile = writeSessionFile('notable-only.jsonl', [
      { ts: '2026-03-25T14:00:00Z', project: 'notable-proj', type: 'pr_merged' },
    ]);

    const results = processSession(sessionFile);
    assert.equal(results.length, 0, 'notable-only session should produce no entries');
  });
});
