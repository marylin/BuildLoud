#!/usr/bin/env node
// bin/journey.js — BuildLoud CLI (v2)
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = {
  log: '../lib/cli/log.js',
  status: '../lib/cli/status.js',
  search: '../lib/cli/search.js',
  doctor: '../lib/cli/doctor.js',
  recover: '../lib/cli/recover.js',
  'process-session': '../lib/cli/process-session.js',
};

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: journey <command> [options]

Commands:
  log              Log a journal entry with scoring and milestone detection
  status           Show entry counts, streaks, projects, and pending sessions
  search <query>   Search journal entries by keyword
  doctor           Check hooks, config, cache, and session file health
  recover          Process orphaned session files into journal entries

Internal:
  process-session  Score session data for the Stop agent hook (not user-facing)

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
