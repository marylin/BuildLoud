// tests/markdown.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TEST_DIR = join(import.meta.dirname, 'test-journal');
const EXPECTED_DEFAULT = join(homedir(), '.claude', 'journey', 'entries');

let md;
beforeEach(async () => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  md = await import('../lib/markdown.js');
  md.setBasePath(TEST_DIR);
});
afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  md.setBasePath(null); // reset to default after each test
});

describe('markdown writer', () => {
  it('creates raw.md with frontmatter on first entry', () => {
    md.writeEntry({
      project: 'testproj', type: 'feature', source: 'stop_hook',
      summary: 'Built the thing.', social_score: 3, notable: false
    }, new Date('2026-03-20T14:32:00Z'));
    const path = join(TEST_DIR, '2026', '03', '20', 'testproj', 'raw.md');
    assert.ok(existsSync(path));
    const content = readFileSync(path, 'utf8');
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.includes('project: testproj'));
    assert.ok(content.includes('type: feature'));
    assert.ok(content.includes('score: 3'));
    assert.ok(content.includes('date: 2026-03-20T14:32:00'));
    // Heading uses local time, not UTC — just check HH:MM format exists
    assert.match(content, /## \d{2}:\d{2}/);
    assert.ok(content.includes('Built the thing.'));
  });

  it('appends to existing raw.md with separator for same project', () => {
    const date1 = new Date('2026-03-20T14:00:00Z');
    const date2 = new Date('2026-03-20T16:00:00Z');
    md.writeEntry({ project: 'proj', type: 'feature', source: 'stop_hook', summary: 'First.', social_score: 4 }, date1);
    md.writeEntry({ project: 'proj', type: 'bugfix', source: 'stop_hook', summary: 'Second.', social_score: 7 }, date2);
    const path = join(TEST_DIR, '2026', '03', '20', 'proj', 'raw.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('First.'));
    assert.ok(content.includes('Second.'));
    // Separator between entries
    assert.ok(content.includes('\n---\n'));
    // Subsequent heading includes type and score
    assert.match(content, /## \d{2}:\d{2} \[bugfix\] \(7\)/);
    // Frontmatter appears only once
    assert.equal(content.split('---\nproject:').length, 2);
  });

  it('includes score in frontmatter', () => {
    md.writeEntry({
      project: 'proj', type: 'insight', source: 'manual_journal',
      summary: 'Big insight.', social_score: 6, notable: false
    }, new Date('2026-03-20T14:00:00Z'));
    const path = join(TEST_DIR, '2026', '03', '20', 'proj', 'raw.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('score: 6'));
  });

  it('creates separate directories for different projects on the same day', () => {
    const date = new Date('2026-03-20T14:00:00Z');
    md.writeEntry({ project: 'alpha', type: 'feature', source: 'stop_hook', summary: 'Alpha work.', social_score: 3 }, date);
    md.writeEntry({ project: 'beta', type: 'bugfix', source: 'stop_hook', summary: 'Beta fix.', social_score: 5 }, date);
    assert.ok(existsSync(join(TEST_DIR, '2026', '03', '20', 'alpha', 'raw.md')));
    assert.ok(existsSync(join(TEST_DIR, '2026', '03', '20', 'beta', 'raw.md')));
    const alpha = readFileSync(join(TEST_DIR, '2026', '03', '20', 'alpha', 'raw.md'), 'utf8');
    assert.ok(alpha.includes('project: alpha'));
    assert.ok(!alpha.includes('Beta'));
  });

  it('uses local system time in heading, not UTC', () => {
    const date = new Date('2026-03-20T23:30:00Z');
    md.writeEntry({ project: 'proj', type: 'feature', source: 'stop_hook', summary: 'Late.', social_score: 2 }, date);
    const localHours = String(date.getHours()).padStart(2, '0');
    const localMinutes = String(date.getMinutes()).padStart(2, '0');
    const dayDir = String(date.getUTCDate()).padStart(2, '0');
    const path = join(TEST_DIR, '2026', '03', dayDir, 'proj', 'raw.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes(`## ${localHours}:${localMinutes}`));
  });

  it('getBasePath returns the current base path', () => {
    assert.equal(md.getBasePath(), TEST_DIR);
  });

  it('setBasePath(null) resets to ~/.claude/journey/entries', () => {
    md.setBasePath(null);
    assert.equal(md.getBasePath(), EXPECTED_DEFAULT);
    md.setBasePath(TEST_DIR);
  });

  it('default base path resolves to ~/.claude/journey/entries', () => {
    md.setBasePath(null);
    assert.equal(md.getBasePath(), EXPECTED_DEFAULT);
    md.setBasePath(TEST_DIR);
  });

  it('writePublished creates platform file with frontmatter', () => {
    const date = new Date('2026-03-20T14:00:00Z');
    md.writePublished({
      project: 'proj',
      platform: 'twitter',
      text: 'Shipped the thing today!',
    }, date);
    const path = join(TEST_DIR, '2026', '03', '20', 'proj', 'twitter.md');
    assert.ok(existsSync(path));
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes('project: proj'));
    assert.ok(content.includes('platform: twitter'));
    assert.ok(content.includes('source: raw.md'));
    assert.ok(content.includes('Shipped the thing today!'));
  });

  it('writePublished overwrites existing platform file', () => {
    const date = new Date('2026-03-20T14:00:00Z');
    md.writePublished({ project: 'proj', platform: 'twitter', text: 'Version 1' }, date);
    md.writePublished({ project: 'proj', platform: 'twitter', text: 'Version 2' }, date);
    const path = join(TEST_DIR, '2026', '03', '20', 'proj', 'twitter.md');
    const content = readFileSync(path, 'utf8');
    assert.ok(!content.includes('Version 1'));
    assert.ok(content.includes('Version 2'));
  });

  it('writePublished creates different files per platform', () => {
    const date = new Date('2026-03-20T14:00:00Z');
    md.writePublished({ project: 'proj', platform: 'twitter', text: 'Tweet' }, date);
    md.writePublished({ project: 'proj', platform: 'linkedin', text: 'Post' }, date);
    assert.ok(existsSync(join(TEST_DIR, '2026', '03', '20', 'proj', 'twitter.md')));
    assert.ok(existsSync(join(TEST_DIR, '2026', '03', '20', 'proj', 'linkedin.md')));
  });
});
