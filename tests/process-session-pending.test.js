// tests/process-session-pending.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Build an env object that redirects the home directory to `dir`.
 * On Windows, Node's os.homedir() reads USERPROFILE (not HOME),
 * so we override both to ensure cross-platform isolation.
 */
function envWithHome(dir) {
  return { ...process.env, HOME: dir, USERPROFILE: dir };
}

describe('process-session --output-pending', () => {
  let tmp, sessionFile;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'buildloud-pending-'));
    // Create journey dirs that process-session expects
    mkdirSync(join(tmp, '.claude', 'journey', 'entries'), { recursive: true });
    // Create a session with a high-score entry (feat + pr_merged = milestone = score 6+)
    sessionFile = join(tmp, 'test-session.jsonl');
    const lines = [
      JSON.stringify({ ts: new Date().toISOString(), project: 'myapp', message: 'feat: ship login flow', type: 'feat' }),
      JSON.stringify({ ts: new Date().toISOString(), type: 'pr_merged', title: 'Login flow', project: 'myapp' }),
    ];
    writeFileSync(sessionFile, lines.join('\n') + '\n');
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes .pending-rewrite.json for score 5+ entries', () => {
    const pendingPath = join(tmp, '.pending-rewrite.json');
    const binPath = join(process.cwd(), 'bin', 'journey.js');
    execSync(
      `node "${binPath}" process-session --file "${sessionFile}" --output-pending "${pendingPath}"`,
      { cwd: process.cwd(), env: envWithHome(tmp) }
    );
    assert.ok(existsSync(pendingPath), '.pending-rewrite.json should exist');
    const pending = JSON.parse(readFileSync(pendingPath, 'utf8'));
    assert.ok(Array.isArray(pending.entries));
    assert.ok(pending.entries.length > 0);
    assert.ok(pending.entries[0].score >= 5);
  });

  it('does not write file for low-score entries', () => {
    // Pre-seed cache so the project is NOT new (avoids +2 new_project + +2 notable bonuses)
    const cachePath = join(tmp, '.claude', 'journey', 'cache.json');
    const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
    cache.allProjects = cache.allProjects || [];
    if (!cache.allProjects.includes('lowproj')) cache.allProjects.push('lowproj');
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));

    const lowFile = join(tmp, 'low-session.jsonl');
    writeFileSync(lowFile, JSON.stringify({ ts: new Date().toISOString(), project: 'lowproj', message: 'chore: update deps', type: 'chore' }) + '\n');
    const pendingPath = join(tmp, '.pending-low.json');
    const binPath = join(process.cwd(), 'bin', 'journey.js');
    execSync(
      `node "${binPath}" process-session --file "${lowFile}" --output-pending "${pendingPath}"`,
      { cwd: process.cwd(), env: envWithHome(tmp) }
    );
    assert.ok(!existsSync(pendingPath), 'should NOT exist for low-score entries');
  });
});
