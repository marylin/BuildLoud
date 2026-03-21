#!/usr/bin/env node
// scripts/journey-capture.js
// Stop hook: processes accumulated commit data, generates summary via Haiku, writes journal entry.
// Called as a background process by the Stop hook.

import { renameSync, readFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.js';
import { logError } from '../lib/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSONL_FILE = join(process.env.HOME || process.env.USERPROFILE, '.claude', 'journey-session.jsonl');
const PROCESSING_FILE = JSONL_FILE.replace('.jsonl', '-processing.jsonl');

async function processFile(filePath) {
  let lines;
  try {
    lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return;
  }

  if (lines.length === 0) {
    unlinkSync(filePath);
    return;
  }

  const commits = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (commits.length === 0) {
    unlinkSync(filePath);
    return;
  }

  // Step 3: Determine project (most frequent, or from cwd)
  const projectCounts = {};
  for (const c of commits) {
    projectCounts[c.project] = (projectCounts[c.project] || 0) + 1;
  }
  const project = Object.entries(projectCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Step 4: Load .env from build-log root
  loadEnv(join(__dirname, '..', '.env'));

  // Step 5: Call Haiku for summary
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[journey-capture] Missing ANTHROPIC_API_KEY, skipping summary');
    unlinkSync(filePath);
    return;
  }

  const commitList = commits.map(c => `- ${c.message || c.msg || '(no message)'}`).join('\n');
  const prompt = `You are a build-in-public journal assistant. Summarize this coding session in 2-3 sentences. Focus on WHAT was built/fixed and WHY it matters. Also classify the session type as exactly one of: feature, bugfix, refactor, exploration, planning, infra.

Project: ${project}
Commits this session:
${commitList}

Respond in JSON format:
{"summary": "...", "type": "feature|bugfix|refactor|exploration|planning|infra"}`;

  let summary, type;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      summary = parsed.summary;
      type = parsed.type;
    }
  } catch (err) {
    console.error('[journey-capture] Haiku call failed:', err.message);
  }

  // Fallback if Haiku fails
  if (!summary) {
    summary = `Session with ${commits.length} commit(s): ${commits.map(c => c.message || c.msg).filter(Boolean).join('; ')}`;
    type = 'feature';
  }

  // Step 6: Write the entry via write-entry orchestrator
  const { write } = await import('../lib/write-entry.js');
  await write({
    project,
    type: ['feature', 'bugfix', 'refactor', 'exploration', 'planning', 'infra'].includes(type) ? type : 'feature',
    source: 'stop_hook',
    summary,
    metadata: {
      commit_count: commits.length,
      commits: commits.map(c => ({ msg: c.message || c.msg, ts: c.ts }))
    }
  });

  // Step 7: Clean up
  unlinkSync(filePath);
}

async function recoverOrphans() {
  // Check for orphaned processing file
  try {
    if (existsSync(PROCESSING_FILE)) {
      const stat = statSync(PROCESSING_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 5 * 60 * 1000) {
        logError('RECOVERY', `Processing orphaned file: ${PROCESSING_FILE} (age: ${Math.round(ageMs / 60000)}m)`);
        await processFile(PROCESSING_FILE);
      }
    }
  } catch (err) {
    logError('RECOVERY', err);
  }

  // Check for stale session file
  try {
    if (existsSync(JSONL_FILE)) {
      const stat = statSync(JSONL_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 60 * 60 * 1000) {
        logError('RECOVERY', `Processing stale session file: ${JSONL_FILE} (age: ${Math.round(ageMs / 3600000)}h)`);
        renameSync(JSONL_FILE, PROCESSING_FILE);
        await processFile(PROCESSING_FILE);
      }
    }
  } catch (err) {
    logError('RECOVERY', err);
  }
}

async function main() {
  // Step 0: Recover orphans first
  await recoverOrphans();

  // Step 1: Atomic rename (claim the batch)
  try {
    renameSync(JSONL_FILE, PROCESSING_FILE);
  } catch {
    // No file or already being processed — nothing to do
    process.exit(0);
  }

  await processFile(PROCESSING_FILE);
}

main().catch(err => {
  logError('CAPTURE_FATAL', err);
  try { unlinkSync(PROCESSING_FILE); } catch {}
  process.exit(1);
});
