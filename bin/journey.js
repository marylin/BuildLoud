#!/usr/bin/env node
// bin/journey.js — Journey Logger CLI
import { parseArgs } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
const { loadEnv } = await import(pathToFileURL(join(__dirname, '..', 'lib', 'env.js')).href);
loadEnv(join(__dirname, '..', '.env'));

const commands = {
  status: '../lib/cli/status.js',
  top: '../lib/cli/top.js',
  search: '../lib/cli/search.js',
  sync: '../lib/cli/sync.js',
  rehumanize: '../lib/cli/rehumanize.js',
  digest: '../lib/cli/digest.js',
};

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: journey <command> [options]

Commands:
  status        Pipeline health report
  top           Query top entries from DB
  search        Search entries (local + DB)
  sync          Sync DB ↔ local markdown
  rehumanize    Retry failed humanizations
  digest        Generate weekly digest

Run 'journey <command> --help' for command-specific options.`);
  process.exit(0);
}

if (!commands[command]) {
  console.error(`Unknown command: ${command}\nRun 'journey --help' for available commands.`);
  process.exit(1);
}

const mod = await import(pathToFileURL(join(__dirname, commands[command])).href);
const args = process.argv.slice(3);
try {
  await mod.run(args);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
