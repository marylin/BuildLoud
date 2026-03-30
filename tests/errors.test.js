// tests/errors.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PATH = join(import.meta.dirname, 'test-journey-errors.log');

let errors;
beforeEach(async () => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
  delete process.env.LOG_LEVEL;
  errors = await import('../lib/errors.js');
  errors.setLogPath(LOG_PATH);
});
afterEach(() => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
  delete process.env.LOG_LEVEL;
});

describe('logError', () => {
  it('creates log file and writes formatted line', () => {
    errors.logError('TEST_CTX', 'something broke');
    const content = readFileSync(LOG_PATH, 'utf8').trim();
    const entry = JSON.parse(content);
    assert.equal(entry.level, 'error');
    assert.equal(entry.ctx, 'TEST_CTX');
    assert.equal(entry.msg, 'something broke');
    assert.ok(entry.ts);
  });

  it('appends multiple errors', () => {
    errors.logError('A', 'first');
    errors.logError('B', 'second');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  it('accepts Error objects', () => {
    errors.logError('ERR', new Error('oops'));
    const content = readFileSync(LOG_PATH, 'utf8').trim();
    const entry = JSON.parse(content);
    assert.equal(entry.msg, 'oops');
    assert.ok(entry.stack);
    assert.match(entry.stack, /Error: oops/);
  });

  it('rotates when exceeding 500 lines', () => {
    const bulkLines = Array.from({ length: 499 }, (_, i) =>
      JSON.stringify({ ts: '2026-03-21T00:00:00.000Z', level: 'error', ctx: 'FILL', msg: `line ${i}` })
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

  it('returns last N lines formatted', () => {
    errors.logError('A', 'one');
    errors.logError('B', 'two');
    errors.logError('C', 'three');
    const result = errors.readErrors(2);
    assert.equal(result.length, 2);
    assert.match(result[1], /\[C\] three/);
  });
});

describe('JSON lines format', () => {
  it('writes JSON lines format', () => {
    errors.logError('CTX', 'test message');
    const content = readFileSync(LOG_PATH, 'utf8').trim();
    const entry = JSON.parse(content);
    assert.equal(typeof entry.ts, 'string');
    assert.equal(entry.level, 'error');
    assert.equal(entry.ctx, 'CTX');
    assert.equal(entry.msg, 'test message');
  });

  it('includes stack for Error objects', () => {
    errors.logError('ERR', new Error('stack test'));
    const entry = JSON.parse(readFileSync(LOG_PATH, 'utf8').trim());
    assert.equal(entry.msg, 'stack test');
    assert.ok(entry.stack);
    assert.match(entry.stack, /stack test/);
  });
});

describe('log levels', () => {
  it('logWarn writes warn level', () => {
    errors.logWarn('W_CTX', 'warning message');
    const entry = JSON.parse(readFileSync(LOG_PATH, 'utf8').trim());
    assert.equal(entry.level, 'warn');
    assert.equal(entry.ctx, 'W_CTX');
    assert.equal(entry.msg, 'warning message');
  });

  it('logInfo writes info level', () => {
    process.env.LOG_LEVEL = 'info';
    errors.logInfo('I_CTX', 'info message');
    const entry = JSON.parse(readFileSync(LOG_PATH, 'utf8').trim());
    assert.equal(entry.level, 'info');
    assert.equal(entry.ctx, 'I_CTX');
    assert.equal(entry.msg, 'info message');
  });

  it('respects LOG_LEVEL threshold', () => {
    process.env.LOG_LEVEL = 'error';
    errors.logWarn('W', 'should not write');
    assert.ok(!existsSync(LOG_PATH) || readFileSync(LOG_PATH, 'utf8').trim() === '');
  });

  it('default threshold allows warn and error', () => {
    errors.logWarn('W', 'visible');
    errors.logInfo('I', 'invisible');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).level, 'warn');
  });
});

describe('mixed format handling', () => {
  it('readErrors handles mixed old/new format', () => {
    const oldLine = '[2026-03-21T00:00:00.000Z] [OLD_CTX] old message';
    const newLine = JSON.stringify({ ts: '2026-03-22T00:00:00.000Z', level: 'error', ctx: 'NEW_CTX', msg: 'new message' });
    writeFileSync(LOG_PATH, oldLine + '\n' + newLine + '\n');
    const result = errors.readErrors(5);
    assert.equal(result.length, 2);
    assert.match(result[0], /old message/);
    assert.match(result[1], /\[NEW_CTX\] new message/);
  });
});
