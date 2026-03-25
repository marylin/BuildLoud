// lib/cli/doctor.js — Diagnostic health check
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEnv, validateConfig } from '../validate.js';
import * as cache from '../cache.js';
import { getQueueStats } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

function icon(status) {
  if (status === 'ok') return '\u2713';
  if (status === 'warn') return '\u26A0';
  return '\u2717';
}

function pad(label) {
  return label.padEnd(18);
}

export async function run() {
  // 1. Environment
  const env = validateEnv();
  if (env.warnings.length === 0 && env.errors.length === 0) {
    const vars = [];
    if (process.env.DATABASE_URL) vars.push('DATABASE_URL set');
    if (process.env.ANTHROPIC_API_KEY) vars.push('ANTHROPIC_API_KEY set');
    console.log(`${icon('ok')} ${pad('Environment')}${vars.join(', ') || 'no vars detected'}`);
  } else {
    for (const e of env.errors) console.log(`${icon('fail')} ${pad('Environment')}${e}`);
    for (const w of env.warnings) console.log(`${icon('warn')} ${pad('Environment')}${w}`);
  }

  // 2. Config
  const configPath = join(PROJECT_ROOT, 'lib', 'config.json');
  if (existsSync(configPath)) {
    const cfg = validateConfig(configPath);
    if (cfg.errors.length === 0 && cfg.warnings.length === 0) {
      console.log(`${icon('ok')} ${pad('Config')}Valid`);
    } else {
      for (const e of cfg.errors) console.log(`${icon('fail')} ${pad('Config')}${e}`);
      for (const w of cfg.warnings) console.log(`${icon('warn')} ${pad('Config')}${w}`);
    }
  } else {
    console.log(`${icon('warn')} ${pad('Config')}lib/config.json not found — using defaults`);
  }

  // 3. Database
  if (process.env.DATABASE_URL) {
    try {
      const start = Date.now();
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      await sql`SELECT 1`;
      console.log(`${icon('ok')} ${pad('Database')}Connected (${Date.now() - start}ms)`);
    } catch (err) {
      console.log(`${icon('fail')} ${pad('Database')}${err.message}`);
    }
  } else {
    console.log(`${icon('warn')} ${pad('Database')}Skipped (no DATABASE_URL)`);
  }

  // 4. Migrations
  if (process.env.DATABASE_URL) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const migrationDir = join(PROJECT_ROOT, 'migrations');
      const sqlFiles = existsSync(migrationDir)
        ? readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()
        : [];
      try {
        const applied = await sql`SELECT filename FROM _migrations ORDER BY filename`;
        const appliedNames = applied.map(r => r.filename);
        const unapplied = sqlFiles.filter(f => !appliedNames.includes(f));
        if (unapplied.length === 0) {
          console.log(`${icon('ok')} ${pad('Migrations')}${appliedNames.length}/${sqlFiles.length} applied`);
        } else {
          console.log(`${icon('warn')} ${pad('Migrations')}${unapplied.length} pending: ${unapplied.join(', ')}`);
        }
      } catch {
        console.log(`${icon('warn')} ${pad('Migrations')}Not initialized — run \`node scripts/migrate.js\``);
      }
    } catch { /* DB connection already reported */ }
  }

  // 5. Queue
  const queueStats = getQueueStats();
  const deadLetterPath = join(PROJECT_ROOT, 'pending-sync.dead.jsonl');
  const deadCount = existsSync(deadLetterPath)
    ? readFileSync(deadLetterPath, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;
  if (queueStats.pending === 0 && deadCount === 0) {
    console.log(`${icon('ok')} ${pad('Queue')}Empty`);
  } else {
    const parts = [];
    if (queueStats.pending > 0) parts.push(`${queueStats.pending} pending`);
    if (deadCount > 0) parts.push(`${deadCount} dead-letter`);
    if (queueStats.oldest) {
      const ageMs = Date.now() - new Date(queueStats.oldest).getTime();
      const hours = Math.floor(ageMs / 3600000);
      parts.push(`oldest: ${hours > 0 ? hours + 'h' : Math.floor(ageMs / 60000) + 'm'} ago`);
    }
    const status = queueStats.pending >= 50 ? 'warn' : 'ok';
    console.log(`${icon(status)} ${pad('Queue')}${parts.join(', ')}`);
  }

  // 6. Cache
  try {
    const stats = cache.getStats();
    console.log(`${icon('ok')} ${pad('Cache')}Healthy (streak: ${stats.currentStreak} days, ${stats.totalEntries} entries)`);
  } catch (err) {
    console.log(`${icon('fail')} ${pad('Cache')}${err.message}`);
  }

  // 7. Hooks
  const hookScripts = [
    { name: 'journey-accumulate.sh', path: join(PROJECT_ROOT, 'scripts', 'journey-accumulate.sh') },
    { name: 'journey-capture.js', path: join(PROJECT_ROOT, 'scripts', 'journey-capture.js') },
  ];
  const missing = hookScripts.filter(h => !existsSync(h.path));
  if (missing.length === 0) {
    console.log(`${icon('ok')} ${pad('Hooks')}All scripts present`);
  } else {
    for (const h of missing) {
      console.log(`${icon('fail')} ${pad('Hooks')}${h.name} not found — see README for setup`);
    }
  }
}
