// lib/markdown.js
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_BASE_PATH = join(homedir(), '.claude', 'journey', 'entries');
let BASE_PATH = DEFAULT_BASE_PATH;

export function setBasePath(p) { BASE_PATH = p ?? DEFAULT_BASE_PATH; }
export function getBasePath() { return BASE_PATH; }

export function writeEntry(entry, date = new Date()) {
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const localTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const project = entry.project || 'unknown';
  const score = entry.social_score || 0;

  const dir = join(BASE_PATH, year, month, day, project);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, 'raw.md');
  const isNew = !existsSync(filePath);

  if (isNew) {
    const frontmatter = [
      '---',
      `project: ${project}`,
      `type: ${entry.type}`,
      `score: ${score}`,
      `date: ${date.toISOString()}`,
      '---',
    ].join('\n');
    writeFileSync(filePath, `${frontmatter}\n\n## ${localTime}\n${entry.summary}\n`);
  } else {
    const heading = `## ${localTime} [${entry.type}] (${score})`;
    appendFileSync(filePath, `\n---\n\n${heading}\n${entry.summary}\n`);
  }

  return filePath;
}
