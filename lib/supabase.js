// lib/supabase.js
import { readFileSync, writeFileSync, appendFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let QUEUE_PATH = join(__dirname, '..', 'pending-sync.jsonl');

export function setQueuePath(p) { QUEUE_PATH = p; }

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
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    enqueue(entry);
    return { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' };
  }

  // Process pending queue first
  await processPendingQueue(url, key);

  const payload = buildPayload(entry);
  try {
    const res = await fetch(`${url}/rest/v1/journey_entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      enqueue(entry);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    enqueue(entry);
    return { ok: false, error: err.message };
  }
}

export async function markPushed(id) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/journey_entries?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({ seo_engine_pushed: true })
    });
  } catch { /* silent */ }
}

export function enqueue(entry) {
  const line = JSON.stringify({ ...entry, _queued_at: new Date().toISOString() });
  appendFileSync(QUEUE_PATH, line + '\n');
}

export function readQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const valid = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter(e => new Date(e._queued_at).getTime() > cutoff);
  if (valid.length > 50) {
    console.warn(`[journey] Retry queue has ${valid.length} entries (>50). Check Supabase connectivity.`);
  }
  return valid;
}

export function clearQueue() {
  if (existsSync(QUEUE_PATH)) unlinkSync(QUEUE_PATH);
}

async function processPendingQueue(url, key) {
  const pending = readQueue();
  if (pending.length === 0) return;
  const succeeded = [];
  for (const entry of pending) {
    const { _queued_at, ...payload } = entry;
    try {
      const res = await fetch(`${url}/rest/v1/journey_entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(buildPayload(payload))
      });
      if (res.ok) succeeded.push(entry);
    } catch { /* skip, will retry next time */ }
  }
  if (succeeded.length === pending.length) {
    clearQueue();
  } else {
    // Rewrite queue without succeeded entries
    const remaining = pending.filter(e => !succeeded.includes(e));
    writeFileSync(QUEUE_PATH,
      remaining.map(e => JSON.stringify(e)).join('\n') + '\n'
    );
  }
}
