// lib/write-entry.js
import * as cache from './cache.js';
import * as score from './score.js';
import * as md from './markdown.js';
import * as db from './db.js';
import * as seoFeed from './seo-feed.js';
import { humanize } from './humanize.js';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let opts = { skipGit: false, skipDb: false, skipSeo: false };

export function setOptions(o) { opts = { ...opts, ...o }; }

export async function write(entry, date = new Date()) {
  // 1. Detect milestones (before updating cache — so "new project" works)
  const milestones = score.detectMilestones(entry);
  const notable = milestones.length > 0;
  if (notable) {
    entry.notable = true;
    entry.metadata = { ...entry.metadata, milestone_types: milestones };
  }

  // 2. Compute score
  const socialScore = score.computeScore(entry);
  entry.social_score = socialScore;

  // 3. Update cache (must happen after scoring but recorded for future entries)
  cache.recordSession(entry.project, date.toISOString().slice(0, 10));
  if (entry.type === 'blocker') cache.recordBlocker(entry.project);

  // 3.5 Humanize (before markdown write, so public_summary is in the file)
  if (entry.social_score >= 5) {
    try {
      const result = await humanize(entry);
      if (result) {
        entry.metadata = {
          ...entry.metadata,
          public_summary: result.public_summary,
          suggested_platform: result.suggested_platform,
          public_summary_version: result.public_summary_version
        };
      }
    } catch { /* humanization failure is non-critical */ }
  }

  // 4. Write to markdown
  const markdownPath = md.writeEntry(entry, date);

  // 5. Write to Neon DB (async, non-blocking)
  if (!opts.skipDb) {
    db.insert(entry).catch(() => {}); // fire-and-forget, queue handles failures
  }

  // 6. Push to seo-engine if score >= threshold
  if (!opts.skipSeo) {
    const dateStr = date.toISOString().slice(0, 10);
    seoFeed.pushEntry(entry, dateStr);
  }

  // 7. Git commit the markdown change
  if (!opts.skipGit) {
    try {
      const buildLogDir = process.env.BUILD_LOG_PATH || dirname(__dirname);
      execSync(`git add "*/*.md" weekly/ && git commit -m "journal: ${entry.project} [${entry.type}]"`, {
        cwd: buildLogDir,
        stdio: 'ignore',
        timeout: 10000
      });
    } catch { /* git commit failure is non-critical */ }
  }

  return {
    markdownPath,
    score: socialScore,
    milestones,
    notable
  };
}
