// lib/cli/search.js
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_BASE = join(homedir(), '.claude', 'journey', 'entries');

export function searchLocal(query, basePath = DEFAULT_BASE) {
  const results = [];
  const queryLower = query.toLowerCase();
  let years;
  try { years = readdirSync(basePath).filter(d => /^\d{4}$/.test(d)); } catch { return results; }
  for (const year of years) {
    const yearPath = join(basePath, year);
    let months;
    try { months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)); } catch { continue; }
    for (const month of months) {
      const monthPath = join(yearPath, month);
      let files;
      try { files = readdirSync(monthPath).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        const filePath = join(monthPath, file);
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push(`${year}/${month}/${file}:${i + 1}: ${lines[i]}`);
          }
        }
      }
    }
  }
  return results;
}

export async function run(args) {
  const { positionals } = parseArgs({
    args,
    options: {},
    strict: false,
    allowPositionals: true,
  });
  const query = positionals[0];
  if (!query) {
    console.error('Usage: journey search <query>');
    process.exit(1);
  }
  const localResults = searchLocal(query);
  if (localResults.length > 0) {
    console.log(`Local matches (${localResults.length}):`);
    for (const line of localResults) console.log(`  ${line}`);
  } else {
    console.log('No local matches.');
  }
}
