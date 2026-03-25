// lib/cli/log.js — Manual journal entry from CLI or skill invocation
import { parseArgs } from 'node:util';
import { basename } from 'node:path';
import { write } from '../write-entry.js';

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      project: { type: 'string', short: 'p' },
      type: { type: 'string', short: 't', default: 'feature' },
      json: { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const summary = positionals.join(' ').trim();
  if (!summary) {
    console.error('Usage: journey log "summary text" [--project name] [--type feature|bugfix|insight|...]');
    process.exit(1);
  }

  const validTypes = ['feature', 'bugfix', 'refactor', 'exploration', 'planning', 'infra', 'insight', 'blocker', 'milestone'];
  const type = validTypes.includes(values.type) ? values.type : 'feature';
  const project = values.project || basename(process.cwd());

  const result = await write({
    project,
    type,
    source: 'manual_journal',
    summary,
    raw_input: summary,
  });

  if (result.deduplicated) {
    if (values.json) {
      console.log(JSON.stringify({ deduplicated: true }));
    } else {
      console.log('Duplicate entry — skipped.');
    }
    return;
  }

  if (values.json) {
    console.log(JSON.stringify({
      score: result.score,
      milestones: result.milestones,
      notable: result.notable,
      path: result.markdownPath,
    }));
  } else {
    const ms = result.milestones.length ? ` | Milestones: ${result.milestones.join(', ')}` : '';
    console.log(`Logged: ${project} [${type}] (score: ${result.score}${ms})`);
  }
}
