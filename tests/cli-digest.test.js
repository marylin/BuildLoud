// tests/cli-digest.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';

const TMP = join(import.meta.dirname, 'tmp-digest');
const CACHE_PATH = join(TMP, 'cache.json');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  cache.setCachePath(CACHE_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('getDigestWindow', () => {
  it('uses last_digest_date from cache when present', async () => {
    const lastDate = '2026-03-14T08:00:00.000Z';
    cache.save({ ...cache.load(), last_digest_date: lastDate });
    const { getDigestWindow } = await import('../lib/cli/digest.js');
    const since = getDigestWindow();
    assert.equal(since, lastDate);
  });

  it('falls back to 7 days when no last_digest_date', async () => {
    const { getDigestWindow } = await import('../lib/cli/digest.js');
    const since = getDigestWindow();
    const diff = Date.now() - new Date(since).getTime();
    assert.ok(diff > 6 * 86400000);
    assert.ok(diff < 8 * 86400000);
  });
});

describe('saveDigestDate', () => {
  it('stores last_digest_date in cache', async () => {
    const { saveDigestDate } = await import('../lib/cli/digest.js');
    saveDigestDate();
    const data = cache.load();
    assert.ok(data.last_digest_date);
    assert.match(data.last_digest_date, /^\d{4}-\d{2}-\d{2}T/);
  });
});
