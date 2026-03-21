// lib/cache.js
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError } from './errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let CACHE_PATH = join(__dirname, 'cache.json');

export function setCachePath(p) { CACHE_PATH = p; }

export function currentWeek(date) {
  const d = new Date(date || Date.now());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function defaultCache() {
  return {
    week: currentWeek(),
    totalEntries: 0,
    weeklyProjects: {},
    allProjects: [],
    projectEntryCounts: {},
    streaks: {},
    blockers: {},
    recent_fingerprints: []
  };
}

export function load() {
  if (!existsSync(CACHE_PATH)) return defaultCache();
  try {
    const data = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    if (data.week !== currentWeek()) {
      data.week = currentWeek();
      data.weeklyProjects = {};
    }
    if (!data.recent_fingerprints) data.recent_fingerprints = [];
    return data;
  } catch {
    // Try backup
    const bakPath = CACHE_PATH.replace('.json', '.bak');
    if (existsSync(bakPath)) {
      try {
        const data = JSON.parse(readFileSync(bakPath, 'utf8'));
        if (data.week !== currentWeek()) {
          data.week = currentWeek();
          data.weeklyProjects = {};
        }
        if (!data.recent_fingerprints) data.recent_fingerprints = [];
        return data;
      } catch {
        logError('CACHE', 'Both cache.json and cache.json.bak corrupted, resetting');
        return defaultCache();
      }
    }
    return defaultCache();
  }
}

export function save(data) {
  // Backup current file before overwriting
  if (existsSync(CACHE_PATH)) {
    try { copyFileSync(CACHE_PATH, CACHE_PATH.replace('.json', '.bak')); } catch { /* ok */ }
  }
  // Atomic write: write to .tmp then rename
  const tmpPath = CACHE_PATH.replace('.json', '.tmp');
  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, CACHE_PATH);
}

export function recordSession(project, dateStr) {
  const data = load();
  data.weeklyProjects[project] = (data.weeklyProjects[project] || 0) + 1;
  data.totalEntries += 1;
  if (!data.projectEntryCounts) data.projectEntryCounts = {};
  data.projectEntryCounts[project] = (data.projectEntryCounts[project] || 0) + 1;
  if (!data.allProjects.includes(project)) data.allProjects.push(project);

  // Streak tracking
  const date = dateStr || new Date().toISOString().slice(0, 10);
  if (!data.streaks[project]) {
    data.streaks[project] = { lastDate: date, count: 1 };
  } else {
    const last = new Date(data.streaks[project].lastDate);
    const curr = new Date(date);
    const diffDays = Math.round((curr - last) / 86400000);
    if (diffDays === 1) {
      data.streaks[project].count += 1;
      data.streaks[project].lastDate = date;
    } else if (diffDays > 1) {
      data.streaks[project] = { lastDate: date, count: 1 };
    }
    // diffDays === 0: same day, no change
  }

  data.lastCapture = new Date().toISOString();
  save(data);
}

export function recordBlocker(project) {
  const data = load();
  if (!data.blockers[project]) data.blockers[project] = [];
  // Prune entries older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  data.blockers[project] = data.blockers[project].filter(
    ts => new Date(ts).getTime() > cutoff
  );
  data.blockers[project].push(new Date().toISOString());
  save(data);
}

export function isNewProject(project) {
  const data = load();
  return !data.allProjects.includes(project);
}

export function weeklyCount(project) {
  const data = load();
  return data.weeklyProjects[project] || 0;
}

export function hasRecentBlocker(project) {
  const data = load();
  if (!data.blockers[project] || data.blockers[project].length === 0) return false;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return data.blockers[project].some(ts => new Date(ts).getTime() > cutoff);
}

export function getStats() {
  const data = load();
  const streakValues = Object.values(data.streaks || {}).map(s => s.count);
  return {
    totalEntries: data.totalEntries || 0,
    weeklyCount: Object.values(data.weeklyProjects || {}).reduce((a, b) => a + b, 0),
    currentStreak: Math.max(0, ...streakValues),
    lastCapture: data.lastCapture || null,
    projectsThisWeek: Object.keys(data.weeklyProjects || {}),
  };
}

export function addFingerprint(fp) {
  const data = load();
  if (!data.recent_fingerprints) data.recent_fingerprints = [];
  data.recent_fingerprints.push(fp);
  if (data.recent_fingerprints.length > 50) {
    data.recent_fingerprints = data.recent_fingerprints.slice(-50);
  }
  save(data);
}

export function hasFingerprint(fp) {
  const data = load();
  return (data.recent_fingerprints || []).includes(fp);
}
