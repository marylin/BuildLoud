// lib/cli/digest.js
import { parseArgs } from 'node:util';
import * as cache from '../cache.js';

export function getDigestWindow() {
  const data = cache.load();
  if (data.last_digest_date) return data.last_digest_date;
  return new Date(Date.now() - 7 * 86400000).toISOString();
}

export function saveDigestDate() {
  const data = cache.load();
  data.last_digest_date = new Date().toISOString();
  cache.save(data);
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      preview: { type: 'boolean', default: false },
      email: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const since = getDigestWindow();

  if (values.preview) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const entries = await sql`
      SELECT social_score, project, summary FROM journey_entries
      WHERE created_at >= ${since} ORDER BY social_score DESC
    `;
    console.log(`Preview: ${entries.length} entries since ${since.slice(0, 10)}`);
    for (const e of entries.slice(0, 10)) {
      console.log(`  ${String(e.social_score).padStart(2)} ${e.project}: ${e.summary.slice(0, 60)}`);
    }
    return;
  }

  // Dynamic import of refactored generate-digest
  const { pathToFileURL } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const digestPath = join(__dirname, '..', '..', 'scripts', 'generate-digest.js');
  const { generateDigest } = await import(pathToFileURL(digestPath).href);
  const result = await generateDigest({ since, email: values.email });
  saveDigestDate();
  console.log(`Digest generated: ${result.entries} entries → ${result.weeklyPath}`);
}
