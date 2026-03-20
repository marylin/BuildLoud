// tests/markdown.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dirname, 'test-journal');

let md;
beforeEach(async () => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  md = await import('../lib/markdown.js');
  md.setBasePath(TEST_DIR);
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('markdown writer', () => {
  it('creates daily file with header on first entry', () => {
    md.writeEntry({
      project: 'testproj', type: 'feature', source: 'stop_hook',
      summary: 'Built the thing.', social_score: 3, notable: false
    }, new Date('2026-03-20T14:32:00Z'));
    const path = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    assert.ok(existsSync(path));
    const content = readFileSync(path, 'utf8');
    assert.ok(content.startsWith('# 2026-03-20'));
    assert.ok(content.includes('testproj'));
    assert.ok(content.includes('[feature]'));
    assert.ok(content.includes('Built the thing.'));
  });

  it('appends to existing daily file', () => {
    const date = new Date('2026-03-20T14:00:00Z');
    md.writeEntry({ project: 'a', type: 'feature', source: 'stop_hook', summary: 'First.', social_score: 1 }, date);
    md.writeEntry({ project: 'b', type: 'bugfix', source: 'stop_hook', summary: 'Second.', social_score: 1 }, new Date('2026-03-20T16:00:00Z'));
    const path = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('First.'));
    assert.ok(content.includes('Second.'));
    // Header should appear only once
    assert.equal(content.split('# 2026-03-20').length, 2);
  });

  it('adds star emoji for notable entries (score >= 5)', () => {
    md.writeEntry({
      project: 'proj', type: 'insight', source: 'manual_journal',
      summary: 'Big insight.', social_score: 6, notable: false
    }, new Date('2026-03-20T14:00:00Z'));
    const path = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('⭐'));
  });

  it('tags manual entries', () => {
    md.writeEntry({
      project: 'proj', type: 'insight', source: 'manual_journal',
      summary: 'Manual note.', social_score: 3
    }, new Date('2026-03-20T14:00:00Z'));
    const path = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('[manual]'));
  });

  it('does not tag auto entries as manual', () => {
    md.writeEntry({
      project: 'proj', type: 'feature', source: 'stop_hook',
      summary: 'Auto.', social_score: 1
    }, new Date('2026-03-20T14:00:00Z'));
    const path = join(TEST_DIR, '2026', '03', '2026-03-20.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(!content.includes('[manual]'));
  });
});
