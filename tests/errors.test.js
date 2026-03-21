// tests/errors.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PATH = join(import.meta.dirname, 'test-journey-errors.log');

let errors;
beforeEach(async () => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
  errors = await import('../lib/errors.js');
  errors.setLogPath(LOG_PATH);
});
afterEach(() => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
});

describe('logError', () => {
  it('creates log file and writes formatted line', () => {
    errors.logError('TEST_CTX', 'something broke');
    const content = readFileSync(LOG_PATH, 'utf8');
    assert.match(content, /\[\d{4}-\d{2}-\d{2}T.*\] \[TEST_CTX\] something broke/);
  });

  it('appends multiple errors', () => {
    errors.logError('A', 'first');
    errors.logError('B', 'second');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  it('accepts Error objects', () => {
    errors.logError('ERR', new Error('oops'));
    const content = readFileSync(LOG_PATH, 'utf8');
    assert.match(content, /\[ERR\] oops/);
  });

  it('rotates when exceeding 500 lines', () => {
    const bulkLines = Array.from({ length: 499 }, (_, i) =>
      `[2026-03-21T00:00:00.000Z] [FILL] line ${i}`
    ).join('\n') + '\n';
    writeFileSync(LOG_PATH, bulkLines);
    errors.logError('FILL', 'line 499');
    errors.logError('FILL', 'line 500');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    assert.ok(lines.length <= 500);
    assert.match(lines[lines.length - 1], /line 500/);
  });
});

describe('readErrors', () => {
  it('returns empty array when no log file', () => {
    const result = errors.readErrors(5);
    assert.deepEqual(result, []);
  });

  it('returns last N lines', () => {
    errors.logError('A', 'one');
    errors.logError('B', 'two');
    errors.logError('C', 'three');
    const result = errors.readErrors(2);
    assert.equal(result.length, 2);
    assert.match(result[1], /three/);
  });
});
