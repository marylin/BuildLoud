// tests/cli-log.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as cache from '../lib/cache.js';
import * as markdown from '../lib/markdown.js';
import { run } from '../lib/cli/log.js';

let tmpDir;
let entriesDir;

before(() => {
  tmpDir = join(tmpdir(), `cli-log-test-${Date.now()}`);
  entriesDir = join(tmpDir, 'entries');
  mkdirSync(entriesDir, { recursive: true });
  cache.setCachePath(join(tmpDir, 'cache.json'));
  markdown.setBasePath(entriesDir);
});

after(() => {
  markdown.setBasePath(null);
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// Find all .md files written under entriesDir
function allMdContent() {
  const lines = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        walk(join(dir, item.name));
      } else if (item.name.endsWith('.md')) {
        lines.push(readFileSync(join(dir, item.name), 'utf8'));
      }
    }
  }
  walk(entriesDir);
  return lines.join('\n');
}

describe('journey log', () => {
  it('writes entry to markdown file with correct content', async () => {
    await run(['Implemented authentication flow', '--project', 'test-proj', '--type', 'feature']);

    const content = allMdContent();
    assert.ok(content.includes('test-proj'), 'markdown should contain project name');
    assert.ok(content.includes('feature'), 'markdown should contain type');
    assert.ok(content.includes('Implemented authentication flow'), 'markdown should contain summary');
  });

  it('returns JSON with score, path, project, type when --json flag is passed', async () => {
    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      await run(['Built the dashboard UI', '--project', 'json-test-proj', '--type', 'feature', '--json']);
    } finally {
      console.log = origLog;
    }

    assert.ok(output.length > 0, 'should have produced output');
    const parsed = JSON.parse(output[0]);
    assert.ok('score' in parsed, 'JSON result should have score');
    assert.ok('path' in parsed, 'JSON result should have path');
    assert.ok('project' in parsed, 'JSON result should have project');
    assert.ok('type' in parsed, 'JSON result should have type');
    assert.equal(parsed.project, 'json-test-proj');
    assert.equal(parsed.type, 'feature');
    assert.equal(typeof parsed.score, 'number');
  });

  it('deduplicates identical entries — second call prints Duplicate', async () => {
    const args = ['Fixed the login redirect bug', '--project', 'dedup-proj', '--type', 'bugfix'];
    await run(args);

    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      await run(args);
    } finally {
      console.log = origLog;
    }

    const combined = output.join(' ');
    assert.ok(combined.toLowerCase().includes('duplicate'), `expected "Duplicate" in output, got: ${combined}`);
  });

  it('classifies type correctly when --type bugfix is passed', async () => {
    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      await run(['Patched null pointer exception', '--project', 'type-test-proj', '--type', 'bugfix', '--json']);
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(output[0]);
    assert.equal(parsed.type, 'bugfix');
  });

  it('falls back to feature type for an invalid type value', async () => {
    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      await run(['Did some work', '--project', 'fallback-proj', '--type', 'invalid-type', '--json']);
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(output[0]);
    assert.equal(parsed.type, 'feature');
  });

  it('uses cwd basename as default project when --project is not passed', async () => {
    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      await run(['Added README documentation', '--type', 'feature', '--json']);
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(output[0]);
    // The project should be the basename of cwd (non-empty string)
    assert.ok(typeof parsed.project === 'string' && parsed.project.length > 0, 'project should be a non-empty string');
    // Should match actual cwd basename
    const expectedProject = process.cwd().split(/[/\\]/).pop();
    assert.equal(parsed.project, expectedProject);
  });

  it('increments total entries in cache after logging', async () => {
    cache.load(); // ensure cache exists
    const statsBefore = cache.getStats();

    await run(['Refactored database layer', '--project', 'cache-count-proj', '--type', 'refactor']);

    const statsAfter = cache.getStats();
    assert.ok(statsAfter.totalEntries > statsBefore.totalEntries, 'totalEntries should increase after log');
  });
});
