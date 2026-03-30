// tests/recover.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as cache from '../lib/cache.js';
import * as markdown from '../lib/markdown.js';
import { recoverOrphans } from '../lib/cli/recover.js';

let tmpDir;
let sessionsDir;
let entriesDir;

before(() => {
  tmpDir = join(tmpdir(), `recover-test-${Date.now()}`);
  sessionsDir = join(tmpDir, 'sessions');
  entriesDir = join(tmpDir, 'entries');
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(entriesDir, { recursive: true });
  cache.setCachePath(join(tmpDir, 'cache.json'));
  markdown.setBasePath(entriesDir);
});

after(() => {
  markdown.setBasePath(null);
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function writeSessionFile(name, events) {
  const filePath = join(sessionsDir, name);
  writeFileSync(filePath, events.map(e => JSON.stringify(e)).join('\n') + '\n');
  return filePath;
}

// Count ## entry headings across all .md files in entriesDir
function countWrittenEntries() {
  let count = 0;
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        walk(join(dir, item.name));
      } else if (item.name.endsWith('.md')) {
        const content = readFileSync(join(dir, item.name), 'utf8');
        count += (content.match(/^## /gm) || []).length;
      }
    }
  }
  walk(entriesDir);
  return count;
}

describe('recoverOrphans', () => {
  it('returns 0 for a non-existent sessions directory', () => {
    const missing = join(tmpDir, 'no-such-dir');
    const count = recoverOrphans(missing);
    assert.equal(count, 0);
  });

  it('returns 0 for an empty sessions directory', () => {
    const emptyDir = join(tmpDir, 'empty-sessions');
    mkdirSync(emptyDir, { recursive: true });
    const count = recoverOrphans(emptyDir);
    assert.equal(count, 0);
  });

  it('recovers a single session file: returns 1, deletes file, writes markdown entry', () => {
    const entriesBefore = countWrittenEntries();

    writeSessionFile('session-single.jsonl', [
      { ts: '2026-03-25T10:00:00Z', project: 'alpha', message: 'feat: add login', type: 'feat' },
      { ts: '2026-03-25T10:05:00Z', project: 'alpha', message: 'feat: add logout', type: 'feat' },
    ]);

    const count = recoverOrphans(sessionsDir);

    assert.equal(count, 1, 'should recover 1 session');
    assert.ok(!existsSync(join(sessionsDir, 'session-single.jsonl')), 'session file should be deleted');
    assert.ok(countWrittenEntries() > entriesBefore, 'at least one markdown entry heading should be written');
  });

  it('recovers multiple session files and returns correct count', () => {
    writeSessionFile('session-a.jsonl', [
      { ts: '2026-03-25T11:00:00Z', project: 'beta', message: 'fix: null check', type: 'fix' },
    ]);
    writeSessionFile('session-b.jsonl', [
      { ts: '2026-03-25T12:00:00Z', project: 'gamma', message: 'refactor: cleanup', type: 'refactor' },
    ]);

    const count = recoverOrphans(sessionsDir);

    assert.ok(count >= 2, `expected at least 2 recovered, got ${count}`);
    assert.ok(!existsSync(join(sessionsDir, 'session-a.jsonl')), 'session-a.jsonl should be deleted');
    assert.ok(!existsSync(join(sessionsDir, 'session-b.jsonl')), 'session-b.jsonl should be deleted');
  });

  it('ignores non-.jsonl files in the sessions directory', () => {
    const txtFile = join(sessionsDir, 'notes.txt');
    writeFileSync(txtFile, 'not a session file');

    const count = recoverOrphans(sessionsDir);

    assert.equal(count, 0, 'txt files should not be processed');
    assert.ok(existsSync(txtFile), 'non-.jsonl file should not be deleted');
  });

  it('handles an empty session file gracefully (no crash, file deleted, count 1)', () => {
    const emptyFile = join(sessionsDir, 'empty-session.jsonl');
    writeFileSync(emptyFile, '');

    const count = recoverOrphans(sessionsDir);

    // Empty session: processSession returns [], so no entries written but file still deleted
    assert.equal(count, 1, 'empty session should still count as recovered (file processed and deleted)');
    assert.ok(!existsSync(emptyFile), 'empty session file should be deleted');
  });

  it('session file content is written correctly to markdown', () => {
    const entriesBefore = countWrittenEntries();
    // Use a timestamp-unique project name to avoid fingerprint dedup from prior test runs
    const uniqueProject = `verify-proj-${Date.now()}`;

    writeSessionFile('session-verify.jsonl', [
      { ts: '2026-03-25T14:00:00Z', project: uniqueProject, message: 'feat: new feature', type: 'feat' },
    ]);

    recoverOrphans(sessionsDir);

    assert.ok(countWrittenEntries() > entriesBefore, 'markdown entry heading should be appended to entry file');
    assert.ok(!existsSync(join(sessionsDir, 'session-verify.jsonl')), 'session file deleted after recovery');
  });
});
