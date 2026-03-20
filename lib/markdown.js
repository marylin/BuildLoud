// lib/markdown.js
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let BASE_PATH = join(__dirname, '..');

export function setBasePath(p) { BASE_PATH = p; }

export function writeEntry(entry, date = new Date()) {
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const time = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

  const dir = join(BASE_PATH, year, month);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${dateStr}.md`);
  const isNew = !existsSync(filePath);

  // Build entry line
  const star = (entry.social_score || 0) >= 5 ? ' ⭐' : '';
  const manual = entry.source === 'manual_journal' ? ' [manual]' : '';
  const header = `## ${time} — ${entry.project} [${entry.type}]${manual}${star}`;
  const block = `\n${header}\n${entry.summary}\n`;

  if (isNew) {
    writeFileSync(filePath, `# ${dateStr}\n${block}`);
  } else {
    appendFileSync(filePath, block);
  }

  return filePath;
}
