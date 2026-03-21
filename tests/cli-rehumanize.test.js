// tests/cli-rehumanize.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('journey rehumanize', () => {
  it('formatCandidate produces readable output', async () => {
    const { formatCandidate } = await import('../lib/cli/rehumanize.js');
    const row = { social_score: 7, created_at: '2026-03-21T10:00:00Z', project: 'alpha', summary: 'Built auth' };
    const line = formatCandidate(row);
    assert.match(line, /7/);
    assert.match(line, /alpha/);
    assert.match(line, /Built auth/);
  });

  it('buildUpdateParams returns valid params', async () => {
    const { buildUpdateParams } = await import('../lib/cli/rehumanize.js');
    const result = { public_summary: 'Public version', suggested_platform: 'twitter', public_summary_version: 'abc123' };
    const params = buildUpdateParams('some-uuid', result);
    assert.equal(params.id, 'some-uuid');
    assert.match(params.metadata, /public_summary/);
  });

  it('formatBlockquote formats correctly', async () => {
    const { formatBlockquote } = await import('../lib/cli/rehumanize.js');
    const bq = formatBlockquote('This is the public version');
    assert.equal(bq, '\n> Public: This is the public version\n');
  });

  it('rateLimit waits approximately 500ms', async () => {
    const { rateLimit } = await import('../lib/cli/rehumanize.js');
    const start = Date.now();
    await rateLimit();
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 400);
  });
});
