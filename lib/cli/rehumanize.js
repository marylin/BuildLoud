// lib/cli/rehumanize.js
import { parseArgs } from 'node:util';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanize } from '../humanize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_PATH = join(__dirname, '..', '..');

export function formatCandidate(row) {
  const score = String(row.social_score).padStart(2);
  const date = row.created_at.slice(0, 10);
  return `${score} ${date} ${row.project}: ${row.summary.slice(0, 60)}`;
}

export function buildUpdateParams(id, result) {
  return {
    id,
    metadata: JSON.stringify({
      public_summary: result.public_summary,
      suggested_platform: result.suggested_platform,
      public_summary_version: result.public_summary_version,
    }),
  };
}

export function formatBlockquote(publicSummary) {
  return `\n> Public: ${publicSummary}\n`;
}

export function rateLimit() {
  return new Promise(resolve => setTimeout(resolve, 500));
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      run: { type: 'boolean', default: false },
      id: { type: 'string' },
    },
    strict: false,
  });

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  let candidates;
  if (values.id) {
    candidates = await sql`
      SELECT * FROM journey_entries
      WHERE id = ${values.id} AND social_score >= 5
        AND (metadata->>'public_summary' IS NULL)
    `;
  } else {
    candidates = await sql`
      SELECT * FROM journey_entries
      WHERE social_score >= 5 AND (metadata->>'public_summary' IS NULL)
      ORDER BY social_score DESC, created_at DESC
    `;
  }

  if (candidates.length === 0) {
    console.log('No candidates for humanization.');
    return;
  }

  if (!values.run) {
    console.log(`${candidates.length} candidates for humanization:\n`);
    for (const row of candidates) {
      console.log(`  ${formatCandidate(row)}`);
    }
    console.log(`\nRun with --run to execute.`);
    return;
  }

  let success = 0;
  for (const row of candidates) {
    try {
      const result = await humanize(row, { force: true });
      if (!result) {
        console.log(`  SKIP ${row.id} — humanize returned null`);
        continue;
      }

      const merged = { ...(row.metadata || {}), ...result };
      await sql`UPDATE journey_entries SET metadata = ${JSON.stringify(merged)} WHERE id = ${row.id}`;

      const date = new Date(row.created_at);
      const year = date.getUTCFullYear().toString();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const mdPath = join(BASE_PATH, year, month, `${year}-${month}-${day}.md`);
      if (existsSync(mdPath)) {
        appendFileSync(mdPath, formatBlockquote(result.public_summary));
      }

      console.log(`  OK   ${row.project}: ${result.public_summary.slice(0, 50)}...`);
      success++;
    } catch (err) {
      console.log(`  FAIL ${row.id}: ${err.message}`);
    }

    await rateLimit();
  }

  console.log(`\nHumanized ${success}/${candidates.length} entries.`);
}
