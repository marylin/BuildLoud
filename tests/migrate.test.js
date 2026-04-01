// tests/migrate.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname, 'tmp-migrate');
const ENTRIES = join(TMP, 'entries');
const BACKUP = join(TMP, 'entries-backup');

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(ENTRIES, { recursive: true });
});
afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('migration', () => {
  it('converts a single-entry flat file to project/raw.md', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n\n## 10:00 \u2014 myproject [feature]\nBuilt the auth system.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    const stats = migrate(ENTRIES, BACKUP);

    const rawPath = join(ENTRIES, '2026', '03', '21', 'myproject', 'raw.md');
    assert.ok(existsSync(rawPath));
    const content = readFileSync(rawPath, 'utf8');
    assert.ok(content.includes('project: myproject'));
    assert.ok(content.includes('type: feature'));
    assert.ok(content.includes('## 10:00'));
    assert.ok(content.includes('Built the auth system.'));
    assert.equal(stats.filesProcessed, 1);
  });

  it('splits multi-project flat file into separate directories', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n\n## 10:00 \u2014 alpha [feature]\nAlpha work.\n\n## 12:00 \u2014 beta [bugfix]\nBeta fix.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    migrate(ENTRIES, BACKUP);

    assert.ok(existsSync(join(ENTRIES, '2026', '03', '21', 'alpha', 'raw.md')));
    assert.ok(existsSync(join(ENTRIES, '2026', '03', '21', 'beta', 'raw.md')));
    const alpha = readFileSync(join(ENTRIES, '2026', '03', '21', 'alpha', 'raw.md'), 'utf8');
    assert.ok(alpha.includes('Alpha work.'));
    assert.ok(!alpha.includes('Beta'));
  });

  it('extracts single-line blockquotes to platform files', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n\n## 10:00 \u2014 proj [milestone]\nShipped it.\n\n> **Public (twitter):** Launched today!\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    migrate(ENTRIES, BACKUP);

    const twitterPath = join(ENTRIES, '2026', '03', '21', 'proj', 'twitter.md');
    assert.ok(existsSync(twitterPath));
    const content = readFileSync(twitterPath, 'utf8');
    assert.ok(content.includes('platform: twitter'));
    assert.ok(content.includes('Launched today!'));
  });

  it('extracts multi-line blockquotes preserving all paragraphs', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n\n## 10:00 \u2014 proj [milestone]\nShipped it.\n\n> **Public (blog):** First paragraph of the blog post.\n>\n> Second paragraph with more detail.\n>\n> Third paragraph wrapping up.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    migrate(ENTRIES, BACKUP);

    const blogPath = join(ENTRIES, '2026', '03', '21', 'proj', 'blog.md');
    assert.ok(existsSync(blogPath));
    const content = readFileSync(blogPath, 'utf8');
    assert.ok(content.includes('First paragraph'));
    assert.ok(content.includes('Second paragraph'));
    assert.ok(content.includes('Third paragraph'));
    // Raw should NOT contain blockquote content
    const raw = readFileSync(join(ENTRIES, '2026', '03', '21', 'proj', 'raw.md'), 'utf8');
    assert.ok(!raw.includes('Second paragraph'));
  });

  it('creates backup before deleting original flat files', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n\n## 10:00 \u2014 proj [feature]\nStuff.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    migrate(ENTRIES, BACKUP);

    // Original flat file should be gone
    assert.ok(!existsSync(join(dir, '2026-03-21.md')));
    // Backup should exist
    assert.ok(existsSync(join(BACKUP, '2026', '03', '2026-03-21.md')));
  });

  it('scores entries using computeScore instead of hardcoding 0', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    // [insight] = 3, [manual] = +3, ⭐ (notable) = +2 → score 8
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n\n## 14:00 \u2014 proj [insight] [manual] \u2b50\nBig realization.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    migrate(ENTRIES, BACKUP);

    const raw = readFileSync(join(ENTRIES, '2026', '03', '21', 'proj', 'raw.md'), 'utf8');
    assert.ok(raw.includes('type: insight'));
    assert.ok(raw.includes('Big realization.'));
    // Score should be computed, not 0
    const scoreMatch = raw.match(/score: (\d+)/);
    assert.ok(scoreMatch, 'frontmatter should contain score');
    const score = parseInt(scoreMatch[1], 10);
    assert.ok(score >= 8, `expected score >= 8 for manual+insight+notable, got ${score}`);
  });

  it('returns stats with counts', async () => {
    const dir = join(ENTRIES, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n\n## 10:00 \u2014 proj [feature]\nStuff.\n');
    writeFileSync(join(dir, '2026-03-22.md'), '# 2026-03-22\n\n## 11:00 \u2014 proj [bugfix]\nFix.\n');

    const { migrate } = await import('../scripts/migrate-entries.js');
    const stats = migrate(ENTRIES, BACKUP);

    assert.equal(stats.filesProcessed, 2);
    assert.ok(stats.entriesMigrated >= 2);
  });
});
