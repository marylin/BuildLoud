// lib/cli/status.js — v2: local-only health report
// cache.getStats() returns: { totalEntries, weeklyCount, currentStreak, lastCapture, projectsThisWeek }
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as cache from '../cache.js';
import { readErrors } from '../errors.js';

export async function run() {
  cache.load();
  const stats = cache.getStats();
  const sessionsDir = join(homedir(), '.claude', 'journey-sessions');

  let pendingSessions = 0;
  try {
    pendingSessions = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl')).length;
  } catch { /* dir may not exist */ }

  const errors = readErrors(3);

  console.log(`Journey Logger Status`);
  console.log(`─────────────────────`);
  console.log(`  Total entries:    ${stats.totalEntries}`);
  console.log(`  This week:        ${stats.weeklyCount} sessions across ${stats.projectsThisWeek.length} projects`);
  console.log(`  Current streak:   ${stats.currentStreak} consecutive days`);
  console.log(`  Pending sessions: ${pendingSessions}`);

  if (stats.lastCapture) {
    const ago = Math.round((Date.now() - new Date(stats.lastCapture).getTime()) / 60000);
    console.log(`  Last capture:     ${ago}m ago`);
  }

  if (stats.projectsThisWeek.length > 0) {
    console.log(`\n  Projects this week: ${stats.projectsThisWeek.join(', ')}`);
  }

  if (errors.length > 0) {
    console.log(`\n  Recent errors (${errors.length}):`);
    for (const e of errors) {
      console.log(`    ${e}`);
    }
  }
}
