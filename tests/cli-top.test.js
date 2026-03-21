// tests/cli-top.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('journey top', () => {
  it('formats entries as table rows', async () => {
    const { formatRow } = await import('../lib/cli/top.js');
    const row = formatRow({
      social_score: 8, created_at: '2026-03-21T10:00:00Z',
      project: 'alpha', summary: 'Built auth system'
    }, 80);
    assert.match(row, /8/);
    assert.match(row, /alpha/);
    assert.match(row, /Built auth/);
  });

  it('builds correct query window for --month', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({ month: true });
    const diff = Date.now() - new Date(win).getTime();
    assert.ok(diff > 29 * 86400000);
    assert.ok(diff < 32 * 86400000);
  });

  it('builds correct query window for --all', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({ all: true });
    assert.equal(win, '1970-01-01T00:00:00.000Z');
  });

  it('defaults to 7-day window', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({});
    const diff = Date.now() - new Date(win).getTime();
    assert.ok(diff > 6 * 86400000);
    assert.ok(diff < 8 * 86400000);
  });
});
