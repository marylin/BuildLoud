// scripts/sync-pr-entries.js
// Pulls pr_hook entries from the database that don't have markdown counterparts.
// Run periodically or on-demand: node scripts/sync-pr-entries.js

import { neon } from '@neondatabase/serverless';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { writeEntry } from '../lib/markdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '..', '.env'));

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const entries = await sql`
    SELECT * FROM journey_entries
    WHERE source = 'pr_hook'
      AND (metadata->>'md_synced') IS NULL
    ORDER BY created_at ASC
  `;
  console.log(`Found ${entries.length} PR entries to sync to markdown`);

  for (const entry of entries) {
    writeEntry(entry, new Date(entry.created_at));
    await sql`
      UPDATE journey_entries
      SET metadata = metadata || '{"md_synced": true}'::jsonb
      WHERE id = ${entry.id}
    `;
  }
  console.log('Done');
}

main().catch(console.error);
