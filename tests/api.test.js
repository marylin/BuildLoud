// tests/api.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let callHaiku, _resetCircuit;

beforeEach(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const mod = await import('../lib/api.js');
  callHaiku = mod.callHaiku;
  _resetCircuit = mod._resetCircuit;
  _resetCircuit();
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = undefined;
});

describe('callHaiku', () => {
  it('returns text on successful response', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ content: [{ text: '{"summary": "hello"}' }] })
    }));
    const result = await callHaiku('test prompt');
    assert.equal(result.ok, true);
    assert.ok(result.text.includes('hello'));
  });

  it('returns error when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await callHaiku('test');
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('API_KEY'));
  });

  it('retries on 429 and succeeds', async () => {
    let attempt = 0;
    globalThis.fetch = mock.fn(() => {
      attempt++;
      if (attempt === 1) return Promise.resolve({ ok: false, status: 429 });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ content: [{ text: 'ok' }] })
      });
    });
    const result = await callHaiku('test', { retryDelays: [10, 20, 40] });
    assert.equal(result.ok, true);
    assert.equal(attempt, 2);
  });

  it('fails fast on 401', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve({ ok: false, status: 401 }));
    const result = await callHaiku('test', { retryDelays: [10, 20, 40] });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, false);
    assert.equal(globalThis.fetch.mock.callCount(), 1);
  });

  it('retries on 5xx', async () => {
    let attempt = 0;
    globalThis.fetch = mock.fn(() => {
      attempt++;
      if (attempt < 3) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ content: [{ text: 'recovered' }] })
      });
    });
    const result = await callHaiku('test', { retryDelays: [10, 20, 40] });
    assert.equal(result.ok, true);
    assert.equal(attempt, 3);
  });

  it('respects custom max_tokens', async () => {
    let captured;
    globalThis.fetch = mock.fn((url, opts) => {
      captured = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({ content: [{ text: 'ok' }] })
      });
    });
    await callHaiku('test', { max_tokens: 1024 });
    assert.equal(captured.max_tokens, 1024);
  });
});

describe('circuit breaker', () => {
  it('opens after 3 consecutive failures', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve({ ok: false, status: 500 }));
    for (let i = 0; i < 3; i++) {
      await callHaiku('test', { retryDelays: [1] });
    }
    const fetchCountBefore = globalThis.fetch.mock.callCount();
    const result = await callHaiku('test', { retryDelays: [1] });
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('circuit-open'));
    assert.equal(globalThis.fetch.mock.callCount(), fetchCountBefore);
  });

  it('resets after cooldown', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve({ ok: false, status: 500 }));
    for (let i = 0; i < 3; i++) {
      await callHaiku('test', { retryDelays: [1] });
    }
    _resetCircuit();
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ content: [{ text: 'back' }] })
    }));
    const result = await callHaiku('test');
    assert.equal(result.ok, true);
  });
});
