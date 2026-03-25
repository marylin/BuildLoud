#!/usr/bin/env node
// scripts/migrate.js — Run database migrations
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

loadEnv(join(PROJECT_ROOT, '.env'));

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Skipping migrations.');
    process.exit(1);
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  const migrationsDir = join(PROJECT_ROOT, 'migrations');
  if (!existsSync(migrationsDir)) {
    console.log('No migrations directory found.');
    return;
  }
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = await sql`SELECT filename FROM _migrations ORDER BY filename`;
  const appliedNames = new Set(applied.map(r => r.filename));

  let count = 0;
  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`  SKIP ${file} (already applied)`);
      continue;
    }
    const content = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await sql([content]);
      await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
      console.log(`  OK   ${file}`);
      count++;
    } catch (err) {
      console.error(`  FAIL ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n${count} migration(s) applied. ${files.length - count} already up to date.`);
}

migrate().catch(err => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
