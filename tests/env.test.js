import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ENV_PATH = join(import.meta.dirname, 'test-.env');

let loadEnv;
beforeEach(async () => {
  if (existsSync(ENV_PATH)) unlinkSync(ENV_PATH);
  delete process.env.TEST_PLAIN;
  delete process.env.TEST_QUOTED_DOUBLE;
  delete process.env.TEST_QUOTED_SINGLE;
  delete process.env.TEST_INLINE_COMMENT;
  delete process.env.TEST_QUOTED_WITH_HASH;
  delete process.env.TEST_EMPTY;
  const mod = await import('../lib/env.js');
  loadEnv = mod.loadEnv;
});
afterEach(() => {
  if (existsSync(ENV_PATH)) unlinkSync(ENV_PATH);
  delete process.env.TEST_PLAIN;
  delete process.env.TEST_QUOTED_DOUBLE;
  delete process.env.TEST_QUOTED_SINGLE;
  delete process.env.TEST_INLINE_COMMENT;
  delete process.env.TEST_QUOTED_WITH_HASH;
  delete process.env.TEST_EMPTY;
});

describe('loadEnv', () => {
  it('parses plain key=value', () => {
    writeFileSync(ENV_PATH, 'TEST_PLAIN=hello\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_PLAIN, 'hello');
  });

  it('strips double quotes from values', () => {
    writeFileSync(ENV_PATH, 'TEST_QUOTED_DOUBLE="postgres://user:pass@host/db"\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_QUOTED_DOUBLE, 'postgres://user:pass@host/db');
  });

  it('strips single quotes from values', () => {
    writeFileSync(ENV_PATH, "TEST_QUOTED_SINGLE='my-secret-key'\n");
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_QUOTED_SINGLE, 'my-secret-key');
  });

  it('handles inline comments', () => {
    writeFileSync(ENV_PATH, 'TEST_INLINE_COMMENT=value # this is a comment\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_INLINE_COMMENT, 'value');
  });

  it('preserves hash inside quotes', () => {
    writeFileSync(ENV_PATH, 'TEST_QUOTED_WITH_HASH="value#notcomment"\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_QUOTED_WITH_HASH, 'value#notcomment');
  });

  it('skips whitespace-only lines', () => {
    writeFileSync(ENV_PATH, '  \n\nTEST_PLAIN=yes\n   \n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_PLAIN, 'yes');
  });

  it('skips comment lines', () => {
    writeFileSync(ENV_PATH, '# comment\nTEST_PLAIN=works\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_PLAIN, 'works');
  });

  it('does not override existing env vars', () => {
    process.env.TEST_PLAIN = 'original';
    writeFileSync(ENV_PATH, 'TEST_PLAIN=overridden\n');
    loadEnv(ENV_PATH);
    assert.equal(process.env.TEST_PLAIN, 'original');
  });

  it('handles missing file gracefully', () => {
    loadEnv('/nonexistent/.env');
    // Should not throw
  });
});
