// lib/humanize.js -- Generate public-ready versions of journal entries
import { createHash } from 'node:crypto';
import { logError } from './errors.js';
import { callHaiku } from './api.js';

function contentHash(summary) {
  return createHash('sha256').update(summary).digest('hex').slice(0, 12);
}

function selectTone(score) {
  return score >= 7 ? 'casual_punchy' : 'professional';
}

function classifyPlatform(text) {
  if (text.length < 280) return 'twitter';
  if (text.length < 600) return 'linkedin';
  return 'blog';
}

function buildPrompt(entry, tone, hint) {
  const toneGuide = tone === 'casual_punchy'
    ? 'First person, short sentences, build-in-public energy. Like a tweet or LinkedIn post. No jargon. Max 3 sentences.'
    : 'First person, thoughtful, blog-ready. Shows expertise without being intimidating. No jargon. Max 5 sentences.';

  const hintLine = hint ? `\nADDITIONAL DIRECTION: ${hint}\n` : '';

  return `You are a build-in-public content writer for a solo tech founder.

Rewrite this technical journal entry for a non-technical audience.
The reader is a potential customer, follower, or fellow builder -- NOT a developer.

TONE: ${tone}
${toneGuide}

RULES:
- Focus on OUTCOMES and WHY they matter, not HOW they were built
- Replace technical terms with plain language
- Include the emotional arc if present (struggle, breakthrough, milestone)
- No em dashes
${hintLine}
Technical entry:
${entry.summary}

Project: ${entry.project}
Type: ${entry.type}

Respond with ONLY valid JSON:
{"public_summary": "the rewritten text"}`;
}

export async function humanize(entry, { force = false, hint = '' } = {}) {
  if (entry.social_score < 5) return null;

  const hash = contentHash(entry.summary);
  if (!force && entry.metadata?.public_summary_version === hash) return null;

  const tone = selectTone(entry.social_score);
  const prompt = buildPrompt(entry, tone, hint);

  const result = await callHaiku(prompt);
  if (!result.ok) {
    logError('HUMANIZE', `Haiku API failed: ${result.error}`);
    return null;
  }

  const match = result.text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (err) {
    logError('HUMANIZE', `Failed to parse Haiku response: ${err.message}`);
    return null;
  }
  if (!parsed.public_summary) return null;

  return {
    public_summary: parsed.public_summary,
    suggested_platform: classifyPlatform(parsed.public_summary),
    public_summary_version: hash
  };
}

// Exported for testing
export { contentHash, selectTone, classifyPlatform, buildPrompt };
