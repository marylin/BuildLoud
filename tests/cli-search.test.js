// tests/cli-search.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(import.meta.dirname, 'tmp-search');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('journey search', () => {
  it('finds matching lines in local markdown', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n## 10:00 — proj [feature]\nBuilt the auth system\n');
    const { searchLocal } = await import('../lib/cli/search.js');
    const results = searchLocal('auth', TMP);
    assert.ok(results.length > 0);
    assert.match(results[0], /auth/);
  });

  it('returns empty for no matches', async () => {
    const { searchLocal } = await import('../lib/cli/search.js');
    const results = searchLocal('nonexistent', TMP);
    assert.equal(results.length, 0);
  });
});
