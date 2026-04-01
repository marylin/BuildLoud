// lib/cli/doctor.js — v2: local-only diagnostics
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as cache from '../cache.js';

export async function run() {
  const journeyDir = join(homedir(), '.claude', 'journey');
  const sessionsDir = join(homedir(), '.claude', 'journey-sessions');
  let pass = 0, warn = 0, fail = 0;

  function ok(msg) { console.log(`  ✓ ${msg}`); pass++; }
  function warning(msg) { console.log(`  ⚠ ${msg}`); warn++; }
  function error(msg) { console.log(`  ✗ ${msg}`); fail++; }

  console.log('BuildLoud Doctor\n');

  // 1. Config
  console.log('Configuration:');
  const configPath = join(journeyDir, 'config.md');
  if (existsSync(configPath)) ok('config.md found');
  else warning('config.md not found — run /journey-init');

  // 2. Entries directory
  console.log('\nStorage:');
  const entriesDir = join(journeyDir, 'entries');
  if (existsSync(entriesDir)) ok(`entries directory: ${entriesDir}`);
  else warning('entries directory does not exist (will be created on first entry)');

  // Check for new directory structure (YYYY/MM/DD/project/raw.md)
  if (existsSync(entriesDir)) {
    try {
      const years = readdirSync(entriesDir).filter(d => /^\d{4}$/.test(d));
      let hasNewFormat = false;
      let hasOldFormat = false;
      for (const year of years) {
        const yearPath = join(entriesDir, year);
        const months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d));
        for (const month of months) {
          const monthPath = join(yearPath, month);
          const items = readdirSync(monthPath);
          if (items.some(i => /^\d{2}$/.test(i))) hasNewFormat = true;
          if (items.some(i => i.endsWith('.md'))) hasOldFormat = true;
        }
      }
      if (hasNewFormat && !hasOldFormat) ok('entries use new directory structure');
      else if (hasOldFormat && !hasNewFormat) warning('entries use old flat format — run migration');
      else if (hasOldFormat && hasNewFormat) warning('mixed old/new entry formats — run migration');
      else if (years.length === 0) ok('entries directory empty (will populate on first entry)');
    } catch {
      warning('could not inspect entries directory structure');
    }
  }

  // 3. Cache
  console.log('\nCache:');
  try {
    const stats = cache.getStats();
    ok(`cache valid — ${stats.totalEntries} entries tracked`);
  } catch (e) {
    error(`cache invalid: ${e.message}`);
  }

  // 4. Sessions
  console.log('\nSessions:');
  if (existsSync(sessionsDir)) {
    const orphans = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    if (orphans.length === 0) ok('no orphaned session files');
    else warning(`${orphans.length} orphaned session file(s) — run 'journey recover'`);
  } else {
    ok('sessions directory will be created on first capture');
  }

  // 5. Hooks
  console.log('\nHooks:');
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const hooksStr = JSON.stringify(settings.hooks || {});
      const hasAccumulate = hooksStr.includes('journey-accumulate');
      const hasNotable = hooksStr.includes('journey-notable');
      const hasStop = hooksStr.includes('agent') && hooksStr.includes('journey');
      if (hasAccumulate) ok('accumulate hook configured');
      else warning('accumulate hook not found in settings.json');
      if (hasNotable) ok('notable events hook configured');
      else warning('notable events hook not found in settings.json (optional)');
      if (hasStop) ok('stop hook configured');
      else warning('stop hook not found in settings.json');
    } catch {
      warning('could not parse settings.json');
    }
  } else {
    warning('~/.claude/settings.json not found');
  }

  // Summary
  console.log(`\n${pass} passed, ${warn} warnings, ${fail} failures`);
}
