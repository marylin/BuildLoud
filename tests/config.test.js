import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
  let tmp;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'buildloud-config-'));
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns basic mode when config.md is missing', async () => {
    const { readConfig } = await import('../lib/config.js');
    const cfg = readConfig(join(tmp, 'nonexistent'));
    assert.equal(cfg.mode, 'basic');
    assert.equal(cfg.voice, '');
  });

  it('reads mode from config.md', async () => {
    const dir = join(tmp, 'with-mode');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.md'), '## Hook Mode\n- mode: enhanced\n\n## Voice\nCasual dev tone');
    const { readConfig } = await import('../lib/config.js');
    const cfg = readConfig(dir);
    assert.equal(cfg.mode, 'enhanced');
    assert.ok(cfg.voice.includes('Casual dev tone'));
  });

  it('defaults to basic for invalid mode', async () => {
    const dir = join(tmp, 'bad-mode');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.md'), '## Hook Mode\n- mode: turbo\n');
    const { readConfig } = await import('../lib/config.js');
    const cfg = readConfig(dir);
    assert.equal(cfg.mode, 'basic');
  });
});
