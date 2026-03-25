// lib/cli/sync.js
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as md from '../markdown.js';
import { getQueueStats, readQueue, insert, clearQueue, readQueueReady, processDeadLetters, buildPayload } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = join(__dirname, '..', '..');

export function countLocalEntries(basePath = DEFAULT_BASE) {
  let count = 0;
  let years;
  try { years = readdirSync(basePath).filter(d => /^\d{4}$/.test(d)); } catch { return 0; }
  for (const year of years) {
    let months;
    try { months = readdirSync(join(basePath, year)).filter(d => /^\d{2}$/.test(d)); } catch { continue; }
    for (const month of months) {
      let files;
      try { files = readdirSync(join(basePath, year, month)).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        const content = readFileSync(join(basePath, year, month, file), 'utf8');
        const headers = content.match(/^## \d{2}:\d{2} — /gm);
        if (headers) count += headers.length;
      }
    }
  }
  return count;
}

export function pullEntry(dbRow, basePath = DEFAULT_BASE) {
  // Null guards (spec 1.5)
  if (!dbRow.created_at) {
    console.warn(`[journey] Skipping entry with null created_at: ${dbRow.id || 'unknown'}`);
    return false;
  }
  const summary = dbRow.summary || '(no summary)';
  const metadata = dbRow.metadata || {};

  const date = new Date(dbRow.created_at);
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const filePath = join(basePath, year, month, `${year}-${month}-${day}.md`);

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf8');
    if (content.includes(summary.slice(0, 80))) return false;
  }

  const oldBase = DEFAULT_BASE;
  md.setBasePath(basePath);
  md.writeEntry({
    project: dbRow.project,
    type: dbRow.type,
    source: dbRow.source,
    summary,
    social_score: dbRow.social_score,
    metadata,
  }, date);
  md.setBasePath(oldBase);
  return true;
}

export async function run(args) {
  const { positionals } = parseArgs({
    args,
    options: {},
    strict: false,
    allowPositionals: true,
  });

  const sub = positionals[0];
  if (!sub || !['pull', 'push', 'status'].includes(sub)) {
    console.log('Usage: journey sync <pull|push|status>');
    return;
  }

  if (sub === 'status') {
    const localCount = countLocalEntries();
    const queue = getQueueStats();
    console.log(`Local entries:  ${localCount}`);
    console.log(`Pending queue:  ${queue.pending}`);
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const [{ count }] = await sql`SELECT count(*)::int as count FROM journey_entries`;
      console.log(`DB entries:     ${count}`);
    } catch (err) {
      console.log(`DB entries:     error — ${err.message}`);
    }
  }

  if (sub === 'pull') {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT * FROM journey_entries ORDER BY created_at DESC`;
    let pulled = 0;
    for (const row of rows) {
      if (pullEntry(row)) pulled++;
    }
    console.log(`Pulled ${pulled} new entries (${rows.length - pulled} already local).`);
  }

  if (sub === 'push') {
    const queue = readQueue();
    if (queue.length === 0) {
      console.log('No pending entries to push.');
      return;
    }

    processDeadLetters();
    const ready = readQueueReady();

    console.log(`Draining queue... ${queue.length} entries`);

    if (!process.env.DATABASE_URL) {
      console.log('  No DATABASE_URL — cannot push.');
      return;
    }

    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);

    let inserted = 0;
    let failedCount = 0;

    for (const entry of ready) {
      const { _queued_at, _retry_count, _next_retry_at, ...rest } = entry;
      const p = buildPayload(rest);
      try {
        await sql`
          INSERT INTO journey_entries (project, type, source, summary, raw_input, notable, social_score, tags, metadata, seo_engine_pushed)
          VALUES (${p.project}, ${p.type}, ${p.source}, ${p.summary}, ${p.raw_input}, ${p.notable}, ${p.social_score}, ${p.tags}, ${JSON.stringify(p.metadata)}, ${p.seo_engine_pushed})
        `;
        inserted++;
      } catch {
        failedCount++;
      }
    }

    const inBackoff = queue.length - ready.length;

    console.log(`  \u2713 ${inserted} inserted`);
    if (inBackoff > 0) console.log(`  \u26A0 ${inBackoff} in backoff`);
    if (failedCount > 0) console.log(`  \u2717 ${failedCount} failed`);

    if (inserted === queue.length) {
      clearQueue();
    }
    if (failedCount > 0) process.exitCode = 1;
  }
}
