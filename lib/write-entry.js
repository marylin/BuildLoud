// lib/write-entry.js
import { createHash } from 'node:crypto';
import * as cache from './cache.js';
import * as score from './score.js';
import * as md from './markdown.js';
import * as db from './db.js';
import * as seoFeed from './seo-feed.js';
import { humanize } from './humanize.js';
import { logError } from './errors.js';
let opts = { skipDb: false, skipSeo: false };

export function setOptions(o) { opts = { ...opts, ...o }; }

export async function write(entry, date = new Date()) {
  // Dedup check (check before, add after db insert to avoid premature dedup)
  const dateStr = date.toISOString().slice(0, 10);
  const fp = createHash('sha256')
    .update(entry.project + dateStr + (entry.summary || '').slice(0, 100))
    .digest('hex').slice(0, 12);
  if (cache.hasFingerprint(fp)) {
    return { deduplicated: true, markdownPath: null, score: 0, milestones: [], notable: false };
  }

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
  cache.recordSession(entry.project, dateStr);
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
      } else {
        // Humanization returned null — mark for retry
        entry.metadata = { ...entry.metadata, humanize_pending: true };
      }
    } catch {
      // Humanization failure — mark for retry
      entry.metadata = { ...entry.metadata, humanize_pending: true };
    }
  }

  // 4. Write to markdown
  const markdownPath = md.writeEntry(entry, date);

  // 5. Write to Neon DB (async, non-blocking)
  // Fingerprint recorded AFTER db.insert resolves — prevents premature dedup (spec 1.1)
  if (!opts.skipDb) {
    db.insert(entry)
      .then(() => cache.addFingerprint(fp))
      .catch(err => {
        logError('db-insert', err);
        // Entry is in pending-sync.jsonl via db.insert's internal enqueue
        cache.addFingerprint(fp);
      });
  } else {
    cache.addFingerprint(fp);
  }

  // 6. Push to seo-engine if score >= threshold
  if (!opts.skipSeo) {
    seoFeed.pushEntry(entry, dateStr);
  }

  return {
    markdownPath,
    score: socialScore,
    milestones,
    notable
  };
}
