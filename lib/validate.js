// lib/validate.js — Startup and config validation
import { readFileSync, existsSync } from 'node:fs';

const CONFIG_SCHEMA = {
  branded_projects: { type: 'array', itemType: 'string' },
  default_tenant: { type: 'string' },
  seo_score_threshold: { type: 'number', min: 0, max: 10 },
  digest_score_threshold: { type: 'number', min: 0, max: 10 },
};

export function validateEnv() {
  const errors = [];
  const warnings = [];

  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL not set — DB features disabled (sync, search --db, top, digest)');
  } else if (!process.env.DATABASE_URL.startsWith('postgres://') &&
             !process.env.DATABASE_URL.startsWith('postgresql://')) {
    warnings.push('DATABASE_URL appears malformed — expected postgres:// prefix. DB features disabled.');
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push('ANTHROPIC_API_KEY not set — humanization disabled');
  }

  if (process.env.SEO_ENGINE_PATH && !existsSync(process.env.SEO_ENGINE_PATH)) {
    warnings.push(`SEO_ENGINE_PATH set but directory not found: ${process.env.SEO_ENGINE_PATH}`);
  }

  if (!process.env.RESEND_API_KEY) {
    warnings.push('RESEND_API_KEY not set — digest email disabled');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function suggestKey(unknown) {
  const known = Object.keys(CONFIG_SCHEMA);
  const lower = unknown.toLowerCase().replace(/[_-]/g, '');
  for (const k of known) {
    if (k.toLowerCase().replace(/[_-]/g, '') === lower) return k;
    if (k.includes(lower) || lower.includes(k.replace(/_/g, ''))) return k;
  }
  return null;
}

export function validateConfig(configPath) {
  const errors = [];
  const warnings = [];

  if (!existsSync(configPath)) return { errors, warnings };

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    errors.push(`Failed to parse config: ${err.message}`);
    return { errors, warnings };
  }

  for (const key of Object.keys(config)) {
    if (!CONFIG_SCHEMA[key]) {
      const suggestion = suggestKey(key);
      const hint = suggestion ? ` — did you mean "${suggestion}"?` : '';
      warnings.push(`Unknown config key "${key}"${hint}`);
    }
  }

  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    if (!(key in config)) continue;
    const val = config[key];
    if (schema.type === 'array') {
      if (!Array.isArray(val)) {
        errors.push(`"${key}": expected array, got ${typeof val}`);
      } else if (schema.itemType && !val.every(v => typeof v === schema.itemType)) {
        errors.push(`"${key}": expected array of ${schema.itemType}s`);
      }
    } else if (schema.type === 'number') {
      if (typeof val !== 'number') {
        errors.push(`"${key}": expected number, got ${typeof val}`);
      } else if (schema.min !== undefined && val < schema.min) {
        errors.push(`"${key}": ${val} is below minimum ${schema.min}`);
      } else if (schema.max !== undefined && val > schema.max) {
        errors.push(`"${key}": ${val} exceeds maximum ${schema.max}`);
      }
    } else if (schema.type === 'string') {
      if (typeof val !== 'string') {
        errors.push(`"${key}": expected string, got ${typeof val}`);
      }
    }
  }

  return { errors, warnings };
}
