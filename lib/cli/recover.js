// lib/cli/recover.js — process orphaned session files
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { processSession } from './process-session.js';
import { writeEntry } from '../markdown.js';

const DEFAULT_SESSIONS_DIR = join(homedir(), '.claude', 'journey-sessions');

export function recoverOrphans(sessionsDir = DEFAULT_SESSIONS_DIR) {
  let files;
  try {
    files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return 0;
  }

  let recovered = 0;
  for (const file of files) {
    const filePath = join(sessionsDir, file);
    try {
      const results = processSession(filePath);
      for (const entry of results) {
        writeEntry({
          project: entry.project,
          type: entry.type,
          source: 'stop_hook',
          summary: entry.raw_summary,
          social_score: entry.score,
          notable: entry.notable,
        });
      }
      unlinkSync(filePath);
      recovered++;
    } catch (err) {
      console.error(`Failed to recover ${file}: ${err.message}`);
    }
  }
  return recovered;
}

export async function run() {
  const count = recoverOrphans();
  if (count === 0) {
    console.log('No orphaned session files found.');
  } else {
    console.log(`Recovered ${count} session${count > 1 ? 's' : ''} → entries written to markdown.`);
  }
}
