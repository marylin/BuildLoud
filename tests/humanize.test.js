// tests/humanize.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let humanize, contentHash, selectTone, classifyPlatform, buildPrompt;
let _resetCircuit;

function mockFetchResponse(public_summary) {
  return mock.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      content: [{ text: JSON.stringify({ public_summary }) }]
    })
  }));
}

beforeEach(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const mod = await import('../lib/humanize.js');
  humanize = mod.humanize;
  contentHash = mod.contentHash;
  selectTone = mod.selectTone;
  classifyPlatform = mod.classifyPlatform;
  buildPrompt = mod.buildPrompt;
  const apiMod = await import('../lib/api.js');
  _resetCircuit = apiMod._resetCircuit;
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.ANTHROPIC_API_KEY;
  if (_resetCircuit) _resetCircuit();
});

function makeEntry(overrides = {}) {
  return {
    project: 'test-project',
    type: 'feature',
    source: 'stop_hook',
    summary: 'Added authentication middleware with JWT validation and refresh token rotation',
    social_score: 7,
    tags: ['auth'],
    metadata: {},
    ...overrides
  };
}

describe('selectTone', () => {
  it('returns casual_punchy for score 7+', () => {
    assert.equal(selectTone(7), 'casual_punchy');
    assert.equal(selectTone(10), 'casual_punchy');
  });

  it('returns professional for score 5-6', () => {
    assert.equal(selectTone(5), 'professional');
    assert.equal(selectTone(6), 'professional');
  });
});

describe('classifyPlatform', () => {
  it('returns twitter for text under 280 chars', () => {
    assert.equal(classifyPlatform('Short post about shipping.'), 'twitter');
  });

  it('returns linkedin for text 280-599 chars', () => {
    const text = 'A'.repeat(400);
    assert.equal(classifyPlatform(text), 'linkedin');
  });

  it('returns blog for text 600+ chars', () => {
    const text = 'A'.repeat(700);
    assert.equal(classifyPlatform(text), 'blog');
  });
});

describe('humanize', () => {
  it('returns null for score below 5', async () => {
    const entry = makeEntry({ social_score: 3 });
    const result = await humanize(entry);
    assert.equal(result, null);
  });

  it('returns null when version hash matches (idempotent)', async () => {
    const entry = makeEntry();
    const hash = contentHash(entry.summary);
    entry.metadata = { public_summary_version: hash };
    const result = await humanize(entry);
    assert.equal(result, null);
  });

  it('regenerates when force is true despite hash match', async () => {
    globalThis.fetch = mockFetchResponse('Shipped a new security feature.');
    const entry = makeEntry();
    const hash = contentHash(entry.summary);
    entry.metadata = { public_summary_version: hash };
    const result = await humanize(entry, { force: true });
    assert.notEqual(result, null);
    assert.equal(result.public_summary, 'Shipped a new security feature.');
    globalThis.fetch = undefined;
  });

  it('regenerates when summary content changes', async () => {
    globalThis.fetch = mockFetchResponse('Updated the login system.');
    const entry = makeEntry();
    entry.metadata = { public_summary_version: 'old-hash-value' };
    const result = await humanize(entry);
    assert.notEqual(result, null);
    assert.equal(result.public_summary_version, contentHash(entry.summary));
    globalThis.fetch = undefined;
  });

  it('appends hint to prompt when provided', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn((url, opts) => {
      capturedBody = opts.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ text: '{"public_summary": "Angled content."}' }]
        })
      });
    });
    const entry = makeEntry();
    await humanize(entry, { hint: 'angle toward lawyers' });
    assert.ok(capturedBody.includes('angle toward lawyers'));
    globalThis.fetch = undefined;
  });

  it('returns null on API failure', async () => {
    globalThis.fetch = mock.fn(() => Promise.resolve({ ok: false, status: 400 }));
    const entry = makeEntry();
    const result = await humanize(entry);
    assert.equal(result, null);
    globalThis.fetch = undefined;
  });

  it('returns null when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const entry = makeEntry();
    const result = await humanize(entry);
    assert.equal(result, null);
  });

  it('computes suggested_platform from output length', async () => {
    const shortText = 'Shipped it!';
    globalThis.fetch = mockFetchResponse(shortText);
    const entry = makeEntry();
    const result = await humanize(entry);
    assert.equal(result.suggested_platform, 'twitter');
    globalThis.fetch = undefined;
  });

  it('uses casual_punchy tone for score 7+', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn((url, opts) => {
      capturedBody = opts.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ text: '{"public_summary": "Punchy content."}' }]
        })
      });
    });
    const entry = makeEntry({ social_score: 8 });
    await humanize(entry);
    assert.ok(capturedBody.includes('casual_punchy'));
    globalThis.fetch = undefined;
  });

  it('uses professional tone for score 5-6', async () => {
    let capturedBody;
    globalThis.fetch = mock.fn((url, opts) => {
      capturedBody = opts.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: [{ text: '{"public_summary": "Professional content."}' }]
        })
      });
    });
    const entry = makeEntry({ social_score: 5 });
    await humanize(entry);
    assert.ok(capturedBody.includes('professional'));
    globalThis.fetch = undefined;
  });
});

describe('api migration (spec 2.4)', () => {
  it('uses callHaiku instead of direct fetch', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'humanize.js'), 'utf8');
    assert.ok(source.includes('callHaiku'), 'Should import and use callHaiku');
    assert.ok(!source.includes("fetch('https://api.anthropic.com"), 'Should not contain direct fetch');
  });
});
