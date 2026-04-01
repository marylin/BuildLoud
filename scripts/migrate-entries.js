// scripts/migrate-entries.js — one-time flat-to-tree migration
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { computeScore } from '../lib/score.js';

const DEFAULT_ENTRIES = join(homedir(), '.claude', 'journey', 'entries');
const DEFAULT_BACKUP = join(homedir(), '.claude', 'journey', 'entries-backup');

// Parse heading line: ## HH:MM — project [type] [manual]? ⭐?
const HEADING_RE = /^## (\d{2}:\d{2}) \u2014 (.+?) \[(\w+)\](\s*\[manual\])?(\s*\u2b50)?$/;
// Parse blockquote: > **Public (platform):** text
const BLOCKQUOTE_RE = /^> \*\*Public \((\w+)\):\*\*\s*(.+)$/;

function parseEntries(content, dateStr) {
  const lines = content.split('\n');
  const entries = [];
  let current = null;
  let activePlatform = null; // track multi-line blockquote capture

  for (const line of lines) {
    if (line.startsWith('# ')) continue;

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      activePlatform = null;
      if (current) entries.push(current);
      current = {
        time: headingMatch[1],
        project: headingMatch[2].trim(),
        type: headingMatch[3],
        source: headingMatch[4] ? 'manual_journal' : 'stop_hook',
        notable: !!headingMatch[5],
        body: [],
        published: {},
      };
      continue;
    }

    if (!current) continue;

    // Start of a new blockquote platform section
    const bqMatch = line.match(BLOCKQUOTE_RE);
    if (bqMatch) {
      activePlatform = bqMatch[1];
      current.published[activePlatform] = bqMatch[2];
      continue;
    }

    // Continuation of a multi-line blockquote
    if (activePlatform && (line.startsWith('> ') || line === '>')) {
      const text = line === '>' ? '' : line.slice(2);
      current.published[activePlatform] += '\n' + text;
      continue;
    }

    // Non-blockquote line ends blockquote capture
    if (activePlatform && !line.startsWith('>')) {
      activePlatform = null;
    }

    if (current.body.length > 0 || line.trim() !== '') {
      current.body.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function scoreEntry(entry) {
  return computeScore({
    project: entry.project,
    type: entry.type,
    source: entry.source,
    notable: entry.notable,
    summary: entry.body.join('\n'),
  });
}

function writeRawFile(entriesDir, dateStr, project, entries) {
  const [year, month, day] = dateStr.split('-');
  const dir = join(entriesDir, year, month, day, project);
  mkdirSync(dir, { recursive: true });

  const first = entries[0];
  const firstScore = scoreEntry(first);
  const frontmatter = [
    '---',
    `project: ${project}`,
    `type: ${first.type}`,
    `score: ${firstScore}`,
    `date: ${dateStr}T${first.time}:00Z`,
    '---',
  ].join('\n');

  let content = `${frontmatter}\n\n## ${first.time}\n${first.body.join('\n').trimEnd()}\n`;

  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    const score = scoreEntry(e);
    content += `\n---\n\n## ${e.time} [${e.type}] (${score})\n${e.body.join('\n').trimEnd()}\n`;
  }

  writeFileSync(join(dir, 'raw.md'), content);
  return entries.length;
}

function writePlatformFiles(entriesDir, dateStr, project, published) {
  const [year, month, day] = dateStr.split('-');
  const dir = join(entriesDir, year, month, day, project);
  mkdirSync(dir, { recursive: true });

  let count = 0;
  for (const [platform, text] of Object.entries(published)) {
    const frontmatter = [
      '---',
      `project: ${project}`,
      `platform: ${platform}`,
      `date: ${dateStr}T00:00:00Z`,
      `source: raw.md`,
      '---',
    ].join('\n');
    writeFileSync(join(dir, `${platform}.md`), `${frontmatter}\n\n${text}\n`);
    count++;
  }
  return count;
}

export function migrate(entriesDir = DEFAULT_ENTRIES, backupDir = DEFAULT_BACKUP) {
  const stats = { filesProcessed: 0, entriesMigrated: 0, platformFiles: 0 };

  let years;
  try { years = readdirSync(entriesDir).filter(d => /^\d{4}$/.test(d)); } catch { return stats; }

  const flatFiles = [];
  for (const year of years) {
    const yearPath = join(entriesDir, year);
    let months;
    try { months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)); } catch { continue; }
    for (const month of months) {
      const monthPath = join(yearPath, month);
      let files;
      try { files = readdirSync(monthPath).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)); } catch { continue; }
      for (const file of files) {
        flatFiles.push({ path: join(monthPath, file), year, month, dateStr: file.replace('.md', '') });
      }
    }
  }

  for (const { path, year, month, dateStr } of flatFiles) {
    const content = readFileSync(path, 'utf8');
    const entries = parseEntries(content, dateStr);
    if (entries.length === 0) continue;

    const byProject = {};
    for (const e of entries) {
      if (!byProject[e.project]) byProject[e.project] = { entries: [], published: {} };
      byProject[e.project].entries.push(e);
      Object.assign(byProject[e.project].published, e.published);
    }

    for (const [project, data] of Object.entries(byProject)) {
      stats.entriesMigrated += writeRawFile(entriesDir, dateStr, project, data.entries);
      stats.platformFiles += writePlatformFiles(entriesDir, dateStr, project, data.published);
    }

    const backupPath = join(backupDir, year, month, `${dateStr}.md`);
    mkdirSync(dirname(backupPath), { recursive: true });
    copyFileSync(path, backupPath);

    unlinkSync(path);
    stats.filesProcessed++;
  }

  return stats;
}

// CLI entrypoint
const isMain = process.argv[1] && (
  process.argv[1].endsWith('migrate-entries.js') ||
  process.argv[1].endsWith('migrate-entries')
);
if (isMain) {
  console.log('Migrating journal entries to new directory structure...');
  const stats = migrate();
  console.log(`Done: ${stats.filesProcessed} files processed, ${stats.entriesMigrated} entries migrated, ${stats.platformFiles} platform files created.`);
}
