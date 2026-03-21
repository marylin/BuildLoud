// scripts/sync-pr-entries.js
// Pulls pr_hook entries from the database that don't have markdown counterparts.
// Run periodically or on-demand: node scripts/sync-pr-entries.js

import { neon } from '@neondatabase/serverless';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { writeEntry } from '../lib/markdown.js';
import { humanize } from '../lib/humanize.js';

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
    // Humanize if score qualifies
    let humanized = {};
    if (entry.social_score >= 5) {
      try {
        const result = await humanize(entry);
        if (result) {
          humanized = {
            public_summary: result.public_summary,
            suggested_platform: result.suggested_platform,
            public_summary_version: result.public_summary_version
          };
          entry.metadata = { ...entry.metadata, ...humanized };
        }
      } catch { /* non-critical */ }
    }

    writeEntry(entry, new Date(entry.created_at));

    // Persist md_synced + humanized metadata back to DB
    await sql`
      UPDATE journey_entries
      SET metadata = metadata || ${JSON.stringify({ md_synced: true, ...humanized })}::jsonb
      WHERE id = ${entry.id}
    `;
  }
  console.log('Done');
}

main().catch(console.error);
