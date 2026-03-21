// lib/cli/status.js
import { parseArgs } from 'node:util';
import * as cache from '../cache.js';
import { getQueueStats } from '../db.js';
import { readErrors } from '../errors.js';

function timeAgo(isoStr) {
  if (!isoStr) return 'never';
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: { db: { type: 'boolean', default: false } },
    strict: false,
  });

  const stats = cache.getStats();
  const queue = getQueueStats();
  const recentErrors = readErrors(5);

  const captureStr = stats.lastCapture
    ? `${stats.lastCapture.slice(0, 16).replace('T', ' ')} UTC (${timeAgo(stats.lastCapture)})`
    : 'never';
  console.log(`Last capture:  ${captureStr}`);
  console.log(`Streak:        ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`);

  const queueStr = queue.pending === 0
    ? 'empty'
    : `${queue.pending} pending (oldest: ${timeAgo(queue.oldest)})`;
  console.log(`Queue:         ${queueStr}`);

  if (recentErrors.length === 0) {
    console.log(`Errors:        none`);
  } else {
    console.log(`Errors:        ${recentErrors.length} recent`);
    for (const line of recentErrors) {
      console.log(`  ${line}`);
    }
  }

  console.log(`Weekly:        ${stats.weeklyCount} entries across ${stats.projectsThisWeek.length} projects`);

  if (values.db) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const [{ count }] = await sql`SELECT count(*)::int as count FROM journey_entries`;
      const [{ latest }] = await sql`SELECT max(created_at)::text as latest FROM journey_entries`;
      console.log(`DB:            connected (${count} entries, latest: ${latest ? latest.slice(0, 10) : 'none'})`);
    } catch (err) {
      console.log(`DB:            error — ${err.message}`);
    }
  }
}
