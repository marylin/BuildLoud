// lib/score.js
import * as cache from './cache.js';

const INSIGHT_PHRASES = [
  'lesson learned', 'key insight', 'figured out', 'realized that',
  'breakthrough', 'aha moment', 'turns out', 'the trick was'
];

const TYPE_SCORES = {
  milestone: 4,
  insight: 3,
  blocker: 3,
  feature: 2,
  bugfix: 1,
  refactor: 1,
  exploration: 0,
  planning: 0,
  infra: 1
};

export function computeScore(entry) {
  let score = 0;

  // Type score
  score += TYPE_SCORES[entry.type] || 0;

  // Manual log bonus
  if (entry.source === 'manual_journal') score += 3;

  // Notable (milestone detected)
  if (entry.notable) score += 2;

  // New project
  if (cache.isNewProject(entry.project)) score += 2;

  // Insight phrases in summary
  const lower = (entry.summary || '').toLowerCase();
  if (INSIGHT_PHRASES.some(phrase => lower.includes(phrase))) score += 1;

  // Hot project (3+ sessions this week)
  if (cache.weeklyCount(entry.project) >= 3) score += 1;

  return Math.min(score, 10);
}

const VOLUME_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

export function detectMilestones(entry) {
  const milestones = [];

  // New project
  if (cache.isNewProject(entry.project)) {
    milestones.push('new_project');
  }

  // Persistence (3+ consecutive days)
  const data = cache.load();
  const streak = data.streaks[entry.project];
  if (streak && streak.count >= 3) {
    milestones.push('persistence');
  }

  // Breakthrough (bugfix/insight after recent blocker)
  if (['bugfix', 'insight'].includes(entry.type) && cache.hasRecentBlocker(entry.project)) {
    milestones.push('breakthrough');
  }

  // Volume milestones
  for (const threshold of VOLUME_MILESTONES) {
    if (data.totalEntries === threshold) {
      milestones.push(`volume_${threshold}`);
    }
  }

  // Shipped (PR merged on project with 5+ total entries)
  if (entry.source === 'pr_hook' && entry.metadata?.action === 'merged') {
    const totalForProject = (data.projectEntryCounts || {})[entry.project] || 0;
    if (totalForProject >= 5) milestones.push('shipped');
  }

  return milestones;
}
