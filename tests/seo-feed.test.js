// tests/seo-feed.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TEST_SEO = join(import.meta.dirname, 'test-seo-engine');

let feed;
beforeEach(async () => {
  if (existsSync(TEST_SEO)) rmSync(TEST_SEO, { recursive: true });
  mkdirSync(join(TEST_SEO, 'tenants', 'whateverai'), { recursive: true });
  mkdirSync(join(TEST_SEO, 'tenants', 'personal-brand'), { recursive: true });
  // Create minimal topic-seeds files
  writeFileSync(join(TEST_SEO, 'tenants', 'whateverai', 'topic-seeds.md'),
    '## Content pillars\n\n- AI tools\n\n## Topic seeds\n\n- How to build agents\n\n## Keywords to target\n\n- ai agents\n\n## Keywords to avoid\n\n- enterprise\n'
  );
  writeFileSync(join(TEST_SEO, 'tenants', 'personal-brand', 'topic-seeds.md'),
    '## Content pillars\n\n- Solo building\n\n## Topic seeds\n\n- My journey building in public\n'
  );
  feed = await import('../lib/seo-feed.js');
  feed.setSeoPath(TEST_SEO);
  feed.setConfig({
    branded_projects: ['WhateverAI', 'whateverops', 'seo-engine'],
    default_tenant: 'personal-brand',
    seo_score_threshold: 7
  });
});
afterEach(() => {
  if (existsSync(TEST_SEO)) rmSync(TEST_SEO, { recursive: true });
});

describe('seo-feed', () => {
  it('routes whateverai project to whateverai tenant', () => {
    const tenant = feed.routeTenant('WhateverAI');
    assert.equal(tenant, 'whateverai');
  });

  it('routes unknown project to personal-brand', () => {
    const tenant = feed.routeTenant('random-project');
    assert.equal(tenant, 'personal-brand');
  });

  it('appends entry under auto-generated section', () => {
    feed.pushEntry({
      project: 'WhateverAI', type: 'insight',
      summary: 'Built a cool caching layer', social_score: 8
    }, '2026-03-20');
    const content = readFileSync(
      join(TEST_SEO, 'tenants', 'whateverai', 'topic-seeds.md'), 'utf8'
    );
    assert.ok(content.includes('## Auto-generated seeds (Journey Logger)'));
    assert.ok(content.includes('Built a cool caching layer'));
    assert.ok(content.includes('2026-03-20'));
  });

  it('creates auto-generated section if missing', () => {
    feed.pushEntry({
      project: 'random', type: 'insight',
      summary: 'Learned something', social_score: 7
    }, '2026-03-20');
    const content = readFileSync(
      join(TEST_SEO, 'tenants', 'personal-brand', 'topic-seeds.md'), 'utf8'
    );
    assert.ok(content.includes('## Auto-generated seeds (Journey Logger)'));
  });

  it('appends multiple entries to existing section', () => {
    feed.pushEntry({ project: 'WhateverAI', type: 'insight', summary: 'First', social_score: 7 }, '2026-03-20');
    feed.pushEntry({ project: 'WhateverAI', type: 'feature', summary: 'Second', social_score: 8 }, '2026-03-20');
    const content = readFileSync(
      join(TEST_SEO, 'tenants', 'whateverai', 'topic-seeds.md'), 'utf8'
    );
    assert.ok(content.includes('First'));
    assert.ok(content.includes('Second'));
    // Section header should appear only once
    assert.equal(content.split('## Auto-generated seeds').length, 2);
  });

  it('does not push entries below threshold', () => {
    const result = feed.shouldPush(6);
    assert.equal(result, false);
  });

  it('pushes entries at or above threshold', () => {
    const result = feed.shouldPush(7);
    assert.equal(result, true);
  });

  it('does not append duplicate entry to topic-seeds', () => {
    const entry = { project: 'whatai', social_score: 8, summary: 'Unique seed entry' };
    feed.pushEntry(entry, '2026-03-21');
    feed.pushEntry(entry, '2026-03-21');
    const seedsPath = join(TEST_SEO, 'tenants', 'personal-brand', 'topic-seeds.md');
    const content = readFileSync(seedsPath, 'utf8');
    const matches = content.match(/Unique seed entry/g);
    assert.equal(matches.length, 1);
  });
});

describe('error handling (spec 1.6)', () => {
  it('handles null config gracefully', () => {
    feed.setConfig(null);
    // routeTenant and shouldPush should not crash
    const result = feed.pushEntry({ social_score: 8, summary: 'test', project: 'x' }, '2026-03-20');
    // May return false since config reload might fail in test env, but should NOT throw
    assert.equal(typeof result, 'boolean');
  });
});
