// lib/errors.js
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let LOG_PATH = join(process.env.HOME || process.env.USERPROFILE || '.', '.claude', 'journey-errors.log');

export function setLogPath(p) { LOG_PATH = p; }
export function getLogPath() { return LOG_PATH; }

const MAX_LINES = 500;
const LEVELS = { error: 0, warn: 1, info: 2 };

function threshold() { return LEVELS[process.env.LOG_LEVEL] ?? LEVELS.warn; }

function writeLog(level, ctx, msgOrErr) {
  if (LEVELS[level] > threshold()) return;
  const isErr = msgOrErr instanceof Error;
  const entry = { ts: new Date().toISOString(), level, ctx, msg: isErr ? msgOrErr.message : String(msgOrErr) };
  if (isErr) entry.stack = msgOrErr.stack;
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  try {
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    if (lines.length > MAX_LINES) writeFileSync(LOG_PATH, lines.slice(-MAX_LINES).join('\n') + '\n');
  } catch { /* rotation failure is non-critical */ }
}

export function logError(context, error) { writeLog('error', context, error); }
export function logWarn(context, msg) { writeLog('warn', context, msg); }
export function logInfo(context, msg) { writeLog('info', context, msg); }

function formatLine(raw) {
  try {
    const e = JSON.parse(raw);
    return `[${e.ts}] [${e.ctx}] ${e.msg}`;
  } catch { return raw; }
}

export function readErrors(n = 5) {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(formatLine);
  } catch { return []; }
}
