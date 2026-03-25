// lib/db.js — PostgreSQL via Neon serverless driver
import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync, renameSync } from 'node:fs';
import { logError } from './errors.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let QUEUE_PATH = join(__dirname, '..', 'pending-sync.jsonl');

export function setQueuePath(p) { QUEUE_PATH = p; }

function getSQL() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

export function buildPayload(entry) {
  return {
    project: entry.project,
    type: entry.type,
    source: entry.source,
    summary: entry.summary,
    raw_input: entry.raw_input || null,
    notable: entry.notable || false,
    social_score: entry.social_score || 0,
    tags: entry.tags || [],
    metadata: entry.metadata || {},
    seo_engine_pushed: entry.seo_engine_pushed || false
  };
}

export async function insert(entry) {
  const sql = getSQL();
  if (!sql) {
    enqueue(entry);
    return { ok: false, error: 'Missing DATABASE_URL' };
  }

  // Process pending queue first
  await processPendingQueue(sql);

  const p = buildPayload(entry);
  try {
    const rows = await sql`
      INSERT INTO journey_entries (project, type, source, summary, raw_input, notable, social_score, tags, metadata, seo_engine_pushed)
      VALUES (${p.project}, ${p.type}, ${p.source}, ${p.summary}, ${p.raw_input}, ${p.notable}, ${p.social_score}, ${p.tags}, ${JSON.stringify(p.metadata)}, ${p.seo_engine_pushed})
      RETURNING *
    `;
    return { ok: true, data: rows[0] };
  } catch (err) {
    enqueue(entry);
    return { ok: false, error: err.message };
  }
}

export async function markPushed(id) {
  const sql = getSQL();
  if (!sql) return;
  try {
    await sql`UPDATE journey_entries SET seo_engine_pushed = true WHERE id = ${id}`;
  } catch { /* silent */ }
}

export function enqueue(entry) {
  const line = JSON.stringify({ ...entry, _queued_at: new Date().toISOString() });
  appendFileSync(QUEUE_PATH, line + '\n');
}

export function readQueue() {
  // Recover orphaned .tmp file (crash during atomic rewrite)
  const tmpPath = QUEUE_PATH + '.tmp';
  if (existsSync(tmpPath)) {
    if (!existsSync(QUEUE_PATH)) {
      try { renameSync(tmpPath, QUEUE_PATH); } catch { /* will read below */ }
    } else {
      try {
        const tmpContent = readFileSync(tmpPath, 'utf8').trim();
        if (tmpContent) appendFileSync(QUEUE_PATH, tmpContent + '\n');
        unlinkSync(tmpPath);
      } catch { /* best effort */ }
    }
  }
  if (!existsSync(QUEUE_PATH)) return [];
  const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const parsed = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  const valid = parsed.filter(e => new Date(e._queued_at).getTime() > cutoff);
  const dropped = parsed.length - valid.length;
  if (dropped > 0) {
    logError('QUEUE_DROP', `Dropped ${dropped} expired entries (>7 days) from retry queue`);
  }
  if (valid.length > 50) {
    console.warn(`[journey] Retry queue has ${valid.length} entries (>50). Check DB connectivity.`);
  }
  return valid;
}

export function clearQueue() {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
}

export function getQueueStats() {
  if (!existsSync(QUEUE_PATH)) return { pending: 0, oldest: null, newest: null };
  try {
    const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (entries.length === 0) return { pending: 0, oldest: null, newest: null };
    const timestamps = entries.map(e => e._queued_at).filter(Boolean).sort();
    return {
      pending: entries.length,
      oldest: timestamps[0] || null,
      newest: timestamps[timestamps.length - 1] || null
    };
  } catch {
    return { pending: 0, oldest: null, newest: null };
  }
}

async function processPendingQueue(sql) {
  const pending = readQueue();
  if (pending.length === 0) return;
  const succeeded = [];
  for (const entry of pending) {
    const { _queued_at, ...rest } = entry;
    const p = buildPayload(rest);
    try {
      await sql`
        INSERT INTO journey_entries (project, type, source, summary, raw_input, notable, social_score, tags, metadata, seo_engine_pushed)
        VALUES (${p.project}, ${p.type}, ${p.source}, ${p.summary}, ${p.raw_input}, ${p.notable}, ${p.social_score}, ${p.tags}, ${JSON.stringify(p.metadata)}, ${p.seo_engine_pushed})
      `;
      succeeded.push(entry);
    } catch { /* skip, will retry next time */ }
  }
  if (succeeded.length === pending.length) {
    clearQueue();
  } else {
    const remaining = pending.filter(e => !succeeded.includes(e));
    const tmpPath = QUEUE_PATH + '.tmp';
    writeFileSync(tmpPath, remaining.map(e => JSON.stringify(e)).join('\n') + '\n');
    try {
      renameSync(tmpPath, QUEUE_PATH);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await new Promise(r => setTimeout(r, 100));
        try { renameSync(tmpPath, QUEUE_PATH); } catch {
          logError('queue-rewrite', 'Atomic rename failed, .tmp left for recovery');
        }
      }
    }
  }
}
