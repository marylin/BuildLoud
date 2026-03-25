// lib/cli/process-session.js
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as cache from '../cache.js';
import { computeScore, detectMilestones } from '../score.js';

export function processSession(filePath) {
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  const lines = content.split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); }
    catch { /* skip malformed */ }
  }
  if (events.length === 0) return [];

  // Separate commits (have .message) from notable events (don't)
  const commits = events.filter(e => e.message);
  const notables = events.filter(e => !e.message && e.type);

  // Group by project
  const byProject = {};
  for (const c of commits) {
    const p = c.project || 'unknown';
    if (!byProject[p]) byProject[p] = [];
    byProject[p].push(c);
  }
  for (const n of notables) {
    const p = n.project || 'unknown';
    if (!byProject[p]) byProject[p] = [];
    byProject[p].push(n);
  }

  cache.load();
  const results = [];
  const dateStr = new Date().toISOString().slice(0, 10);

  for (const [project, projectEvents] of Object.entries(byProject)) {
    const projectCommits = projectEvents.filter(e => e.message);
    const projectNotables = projectEvents.filter(e => !e.message);
    if (projectCommits.length === 0 && projectNotables.length === 0) continue;

    // Build raw summary from commit messages (strip conventional commit prefix)
    const messages = projectCommits.map(c => {
      return (c.message || '').replace(/^(\w+)(\(.+?\))?:\s*/, '');
    });
    const raw_summary = messages.length === 1
      ? messages[0]
      : messages.length <= 3
        ? messages.join(', ')
        : `${messages.slice(0, 2).join(', ')}, and ${messages.length - 2} more`;

    // Determine dominant type
    const typeCounts = {};
    for (const c of projectCommits) {
      typeCounts[c.type || 'unknown'] = (typeCounts[c.type || 'unknown'] || 0) + 1;
    }
    let dominantType = 'feature';
    let maxCount = 0;
    for (const [t, count] of Object.entries(typeCounts)) {
      if (count > maxCount) { dominantType = t; maxCount = count; }
    }
    const typeMap = {
      feat: 'feature', fix: 'bugfix', refactor: 'refactor',
      test: 'infra', docs: 'planning', chore: 'infra',
      style: 'refactor', perf: 'refactor', ci: 'infra',
    };
    const journeyType = typeMap[dominantType] || dominantType;

    const hasPrMerge = projectNotables.some(n => n.type === 'pr_merged');
    const entry = {
      project,
      type: hasPrMerge ? 'milestone' : journeyType,
      source: 'stop_hook',
      summary: raw_summary,
    };

    const milestones = detectMilestones(entry);
    if (milestones.length > 0) entry.notable = true;
    const score = computeScore(entry);

    // Dedup
    const fp = createHash('sha256')
      .update(`${project}${dateStr}${raw_summary.slice(0, 100)}`)
      .digest('hex').slice(0, 16);
    if (cache.hasFingerprint(fp)) continue;

    cache.recordSession(project, dateStr);
    if (journeyType === 'blocker') cache.recordBlocker(project);
    cache.addFingerprint(fp);

    results.push({
      project, type: entry.type, score, milestones,
      notable: entry.notable || false,
      commits: projectCommits.map(c => ({ msg: c.message, ts: c.ts })),
      notables: projectNotables, raw_summary, dateStr,
    });
  }
  return results;
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: { file: { type: 'string', short: 'f' } },
  });
  if (!values.file) {
    console.error('Usage: journey process-session --file PATH');
    process.exit(1);
  }
  const results = processSession(values.file);
  console.log(JSON.stringify(results, null, 2));
}
