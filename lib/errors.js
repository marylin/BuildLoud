// lib/errors.js
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let LOG_PATH = join(process.env.HOME || process.env.USERPROFILE || '.', '.claude', 'journey-errors.log');

export function setLogPath(p) { LOG_PATH = p; }
export function getLogPath() { return LOG_PATH; }

const MAX_LINES = 500;

export function logError(context, error) {
  const msg = error instanceof Error ? error.message : String(error);
  const line = `[${new Date().toISOString()}] [${context}] ${msg}\n`;
  appendFileSync(LOG_PATH, line);

  // Rotate if needed
  try {
    const content = readFileSync(LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length > MAX_LINES) {
      writeFileSync(LOG_PATH, lines.slice(-MAX_LINES).join('\n') + '\n');
    }
  } catch { /* rotation failure is non-critical */ }
}

export function readErrors(n = 5) {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n);
  } catch { return []; }
}
