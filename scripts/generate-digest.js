// scripts/generate-digest.js
// Generates weekly digest from database entries.
// Run: node scripts/generate-digest.js
// Or triggered by n8n workflow.

import { neon } from '@neondatabase/serverless';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '../lib/env.js';
import { callHaiku } from '../lib/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_LOG = join(__dirname, '..');

loadEnv(join(BUILD_LOG, '.env'));

// ISO week calculation — Thursday-based algorithm matching lib/cache.js currentWeek()
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - yearStart) / 86400000 - 3 + ((yearStart.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export async function generateDigest({ since, email = false } = {}) {
  const sql = neon(process.env.DATABASE_URL);

  // Fetch entries since the given date, or last 7 days by default
  const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const entries = await sql`
    SELECT * FROM journey_entries
    WHERE created_at >= ${sinceDate}
    ORDER BY social_score DESC
  `;

  if (!entries.length) {
    console.log('No entries this week. Skipping digest.');
    const week = getISOWeek(new Date());
    const weeklyDir = join(BUILD_LOG, 'weekly');
    mkdirSync(weeklyDir, { recursive: true });
    const weeklyPath = join(weeklyDir, `${week}.md`);
    return { entries: 0, weeklyPath };
  }

  // Call Haiku for digest narrative
  const entrySummaries = entries.slice(0, 15).map(e =>
    `[${e.type}] ${e.project}: ${e.summary} (score: ${e.social_score})`
  ).join('\n');

  const prompt = `You are a build-in-public journal assistant for a solo preneur.
Write a weekly digest from these journal entries. Include:
1. **Week summary**: 2-3 sentences on themes, energy, and what the week felt like
2. **Top 5 moments**: The highest-value entries with a brief note on why each matters for social content
3. **Suggested narratives**: 2-3 blog/LinkedIn post angles that could be written from this week's entries

Entries (sorted by social-worthiness score, highest first):
${entrySummaries}

Write in a warm, authentic voice. This is for the builder to review, not for publishing directly.`;

  let digestContent;
  try {
    const result = await callHaiku(prompt, { max_tokens: 1024 });
    digestContent = result.ok ? result.text : `Digest generation failed: ${result.error}`;
  } catch (err) {
    digestContent = `Digest generation failed: ${err.message}\n\nRaw entries:\n${entrySummaries}`;
  }

  // Write to weekly markdown
  const week = getISOWeek(new Date());
  const weeklyDir = join(BUILD_LOG, 'weekly');
  mkdirSync(weeklyDir, { recursive: true });
  const weeklyPath = join(weeklyDir, `${week}.md`);

  const weeklyContent = `# Weekly Digest: ${week}\n\n_Generated ${new Date().toISOString().slice(0, 10)}_\n_${entries.length} entries this week_\n\n${digestContent}\n\n---\n\n## Raw Entries\n\n${entries.map(e => `- **${e.project}** [${e.type}] (${e.social_score}): ${e.summary}`).join('\n')}\n`;

  writeFileSync(weeklyPath, weeklyContent);
  console.log(`Digest written to ${weeklyPath}`);

  // Mark entries as included in digest
  for (const entry of entries) {
    try {
      await sql`UPDATE journey_entries SET digest_included_in = ${week} WHERE id = ${entry.id}`;
    } catch {}
  }

  // Send email via Resend (if configured and email flag is true)
  if (email) {
    const resendKey = process.env.RESEND_API_KEY;
    const digestEmail = process.env.DIGEST_EMAIL;
    if (resendKey && digestEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`
          },
          body: JSON.stringify({
            from: process.env.DIGEST_FROM_EMAIL || 'Journey Logger <noreply@example.com>',
            to: [digestEmail],
            subject: `Weekly Build Log: ${week}`,
            html: `<pre style="font-family: monospace; white-space: pre-wrap;">${digestContent}</pre>`
          })
        });
        console.log(`Email sent to ${digestEmail}`);
      } catch (err) {
        console.error('Email failed:', err.message);
      }
    }
  }

  return { entries: entries.length, weeklyPath };
}

// Standalone entry point
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  const hasEmail = !!(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL);
  generateDigest({ email: hasEmail }).catch(console.error);
}
