#!/usr/bin/env node
// bin/journey.js — Journey Logger CLI (v2)
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
  log              Write a manual journal entry
  status           Local health report
  search           Search entries in markdown files
  doctor           Diagnostic health check
  recover          Process orphaned session files
  process-session  Score session data (internal, used by agent hook)

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
