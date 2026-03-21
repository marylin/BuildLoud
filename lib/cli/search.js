// lib/cli/search.js
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = join(__dirname, '..', '..');

export function searchLocal(query, basePath = DEFAULT_BASE) {
  const results = [];
  const queryLower = query.toLowerCase();
  let years;
  try { years = readdirSync(basePath).filter(d => /^\d{4}$/.test(d)); } catch { return results; }
  for (const year of years) {
    const yearPath = join(basePath, year);
    let months;
    try { months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)); } catch { continue; }
    for (const month of months) {
      const monthPath = join(yearPath, month);
      let files;
      try { files = readdirSync(monthPath).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        const filePath = join(monthPath, file);
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push(`${year}/${month}/${file}:${i + 1}: ${lines[i]}`);
          }
        }
      }
    }
  }
  return results;
}

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { db: { type: 'boolean', default: false } },
    strict: false,
    allowPositionals: true,
  });
  const query = positionals[0];
  if (!query) {
    console.error('Usage: journey search <query> [--db]');
    process.exit(1);
  }
  const localResults = searchLocal(query);
  if (localResults.length > 0) {
    console.log(`Local matches (${localResults.length}):`);
    for (const line of localResults) console.log(`  ${line}`);
  } else {
    console.log('No local matches.');
  }
  if (values.db) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const pattern = `%${query}%`;
      const rows = await sql`
        SELECT social_score, created_at, project, summary FROM journey_entries
        WHERE summary ILIKE ${pattern} OR metadata::text ILIKE ${pattern}
        ORDER BY created_at DESC LIMIT 20
      `;
      if (rows.length > 0) {
        console.log(`\nDB matches (${rows.length}):`);
        for (const r of rows) {
          console.log(`  ${String(r.social_score).padStart(2)} ${r.created_at.slice(0, 10)} ${r.project}: ${r.summary.slice(0, 60)}`);
        }
      } else {
        console.log('\nNo DB matches.');
      }
    } catch (err) {
      console.log(`\nDB search failed: ${err.message}`);
    }
  }
}
