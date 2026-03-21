// lib/seo-feed.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let SEO_PATH = process.env.SEO_ENGINE_PATH;

let _config = null;
function getConfig() {
  if (!_config) _config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
  return _config;
}
export function setConfig(c) { _config = c; }

export function setSeoPath(p) { SEO_PATH = p; }

export function routeTenant(project) {
  const config = getConfig();
  return config.branded_projects.includes(project) ? 'whateverai' : config.default_tenant;
}

export function shouldPush(score) {
  const config = getConfig();
  return score >= (config.seo_score_threshold || 7);
}

const SECTION_HEADER = '## Auto-generated seeds (Journey Logger)';

export function pushEntry(entry, dateStr) {
  if (!shouldPush(entry.social_score)) return false;

  const tenant = routeTenant(entry.project);
  const seedsPath = join(SEO_PATH, 'tenants', tenant, 'topic-seeds.md');

  if (!existsSync(seedsPath)) return false;

  let content = readFileSync(seedsPath, 'utf8');
  const line = `- ${entry.summary} — Source: build-log ${dateStr} [${entry.project}]`;

  // Idempotency check
  if (content.includes(line)) return false;

  if (content.includes(SECTION_HEADER)) {
    // Append under existing section
    const idx = content.indexOf(SECTION_HEADER) + SECTION_HEADER.length;
    const before = content.slice(0, idx);
    const after = content.slice(idx);
    content = before + '\n' + line + after;
  } else {
    // Create section at end of file
    content = content.trimEnd() + '\n\n' + SECTION_HEADER + '\n' + line + '\n';
  }

  writeFileSync(seedsPath, content);
  return true;
}
