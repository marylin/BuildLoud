// lib/seo-feed.js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError } from './errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let SEO_PATH = process.env.SEO_ENGINE_PATH;

let _config = null;
function getConfig() {
  if (!_config) {
    try {
      _config = JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf8'));
    } catch (err) {
      logError('seo-config', err);
      return null;
    }
  }
  return _config;
}
export function setConfig(c) { _config = c; }

export function setSeoPath(p) { SEO_PATH = p; }

export function routeTenant(project) {
  const config = getConfig();
  if (!config) return null;
  return config.branded_projects.includes(project) ? 'whateverai' : config.default_tenant;
}

export function shouldPush(score) {
  const config = getConfig();
  if (!config) return false;
  return score >= (config.seo_score_threshold || 7);
}

const SECTION_HEADER = '## Auto-generated seeds (Journey Logger)';

export function pushEntry(entry, dateStr) {
  if (!shouldPush(entry.social_score)) return false;

  const tenant = routeTenant(entry.project);
  if (!tenant) return false;
  if (!SEO_PATH) return false;
  const seedsPath = join(SEO_PATH, 'tenants', tenant, 'topic-seeds.md');

  if (!existsSync(seedsPath)) return false;

  try {
    let content = readFileSync(seedsPath, 'utf8');
    const line = `- ${entry.summary} — Source: build-log ${dateStr} [${entry.project}]`;
    if (content.includes(line)) return false;

    if (content.includes(SECTION_HEADER)) {
      const idx = content.indexOf(SECTION_HEADER) + SECTION_HEADER.length;
      const before = content.slice(0, idx);
      const after = content.slice(idx);
      content = before + '\n' + line + after;
    } else {
      content = content.trimEnd() + '\n\n' + SECTION_HEADER + '\n' + line + '\n';
    }

    writeFileSync(seedsPath, content);
    return true;
  } catch (err) {
    logError('seo-write', err);
    return false;
  }
}
