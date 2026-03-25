// tests/validate.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let validateEnv, validateConfig;
const CONFIG_PATH = join(import.meta.dirname, 'test-config.json');

beforeEach(async () => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
  const mod = await import('../lib/validate.js');
  validateEnv = mod.validateEnv;
  validateConfig = mod.validateConfig;
});
afterEach(() => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
});

describe('validateEnv', () => {
  it('warns when DATABASE_URL is missing', () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const result = validateEnv();
    assert.ok(result.warnings.some(w => w.includes('DATABASE_URL')));
    if (saved) process.env.DATABASE_URL = saved;
  });

  it('warns when ANTHROPIC_API_KEY is missing', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const result = validateEnv();
    assert.ok(result.warnings.some(w => w.includes('ANTHROPIC_API_KEY')));
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });

  it('warns when DATABASE_URL is malformed', () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'mysql://wrong-prefix';
    const result = validateEnv();
    assert.ok(result.warnings.some(w => w.includes('malformed')));
    if (saved) process.env.DATABASE_URL = saved; else delete process.env.DATABASE_URL;
  });

  it('returns valid:true with no errors', () => {
    const result = validateEnv();
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});

describe('validateConfig', () => {
  it('returns empty warnings for valid config', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      branded_projects: ['Proj'],
      default_tenant: 'personal',
      seo_score_threshold: 7,
      digest_score_threshold: 5
    }));
    const result = validateConfig(CONFIG_PATH);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('warns on unknown key with suggestion', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      branded_projects: ['Proj'],
      seoScoreThreshold: 7
    }));
    const result = validateConfig(CONFIG_PATH);
    assert.ok(result.warnings.some(w => w.includes('seoScoreThreshold')));
    assert.ok(result.warnings.some(w => w.includes('seo_score_threshold')));
  });

  it('errors on wrong type', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      branded_projects: 'not-an-array',
      seo_score_threshold: 'seven'
    }));
    const result = validateConfig(CONFIG_PATH);
    assert.ok(result.errors.some(e => e.includes('branded_projects')));
    assert.ok(result.errors.some(e => e.includes('seo_score_threshold')));
  });

  it('handles missing config file gracefully', () => {
    const result = validateConfig('/nonexistent/config.json');
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });
});
