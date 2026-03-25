// lib/cli/log.js — v2: direct pipeline, no write-entry.js
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import * as cache from '../cache.js';
import { computeScore, detectMilestones } from '../score.js';
import { writeEntry } from '../markdown.js';

const VALID_TYPES = [
  'feature', 'bugfix', 'refactor', 'exploration',
  'planning', 'infra', 'insight', 'blocker', 'milestone',
];

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      project: { type: 'string', short: 'p' },
      type: { type: 'string', short: 't', default: 'feature' },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const summary = positionals.join(' ');
  if (!summary) {
    console.error('Usage: journey log "summary" --type TYPE --project PROJECT');
    process.exit(1);
  }

  const type = VALID_TYPES.includes(values.type) ? values.type : 'feature';
  const project = values.project || process.cwd().split(/[/\\]/).pop();
  const dateStr = new Date().toISOString().slice(0, 10);

  // Dedup
  const fp = createHash('sha256')
    .update(`${project}${dateStr}${summary.slice(0, 100)}`)
    .digest('hex')
    .slice(0, 16);

  cache.load();
  if (cache.hasFingerprint(fp)) {
    if (values.json) console.log(JSON.stringify({ duplicate: true }));
    else console.log('Duplicate entry — skipped.');
    return;
  }

  const entry = { project, type, source: 'manual_journal', summary };

  // Score
  const milestones = detectMilestones(entry);
  const notable = milestones.length > 0;
  if (notable) entry.notable = true;
  const score = computeScore(entry);
  entry.social_score = score;

  // Cache
  cache.recordSession(project, dateStr);
  if (type === 'blocker') cache.recordBlocker(project);
  cache.addFingerprint(fp);

  // Write markdown
  const mdPath = writeEntry(entry);

  const result = { score, milestones, notable, path: mdPath, project, type };

  if (values.json) {
    console.log(JSON.stringify(result));
  } else {
    const star = score >= 5 ? ' ⭐' : '';
    console.log(`Logged: ${project} [${type}]${star} — ${summary.slice(0, 60)}`);
  }
}
