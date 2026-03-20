// scripts/sync-pr-entries.js
// Pulls pr_hook entries from Supabase that don't have markdown counterparts.
// Run periodically or on-demand: node scripts/sync-pr-entries.js

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { writeEntry } from '../lib/markdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '..', '.env'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

async function main() {
  // Fetch pr_hook entries not yet synced to markdown (use metadata flag)
  const res = await fetch(
    `${url}/rest/v1/journey_entries?source=eq.pr_hook&metadata->>md_synced=is.null&order=created_at.asc`,
    { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
  );
  const entries = await res.json();
  console.log(`Found ${entries.length} PR entries to sync to markdown`);

  for (const entry of entries) {
    writeEntry(entry, new Date(entry.created_at));
    // Mark as synced
    await fetch(`${url}/rest/v1/journey_entries?id=eq.${entry.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ metadata: { ...entry.metadata, md_synced: true } })
    });
  }
  console.log('Done');
}

main().catch(console.error);
