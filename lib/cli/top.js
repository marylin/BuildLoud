// lib/cli/top.js
import { parseArgs } from 'node:util';

export function getWindow(flags) {
  if (flags.all) return '1970-01-01T00:00:00.000Z';
  const days = flags.month ? 30 : 7;
  return new Date(Date.now() - days * 86400000).toISOString();
}

export function formatRow(entry, width = 80) {
  const score = String(entry.social_score).padStart(2);
  const date = entry.created_at.slice(0, 10);
  const proj = entry.project.slice(0, 15).padEnd(15);
  const usedWidth = 2 + 1 + 10 + 1 + 15 + 1;
  const summaryWidth = Math.max(20, width - usedWidth);
  const summary = entry.summary.length > summaryWidth
    ? entry.summary.slice(0, summaryWidth - 3) + '...'
    : entry.summary;
  return `${score} ${date} ${proj} ${summary}`;
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      month: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      n: { type: 'string', default: '10' },
    },
    strict: false,
  });

  const limit = parseInt(values.n, 10) || 10;
  const since = getWindow(values);

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const entries = await sql`
    SELECT * FROM journey_entries
    WHERE created_at > ${since}
    ORDER BY social_score DESC, created_at DESC
    LIMIT ${limit}
  `;

  if (entries.length === 0) {
    console.log('No entries found.');
    return;
  }

  const width = process.stdout.columns || 80;
  for (const entry of entries) {
    console.log(formatRow(entry, width));
  }
}
