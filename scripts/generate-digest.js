// scripts/generate-digest.js
// Generates weekly digest from database entries.
// Run: node scripts/generate-digest.js
// Or triggered by n8n workflow.

import { neon } from '@neondatabase/serverless';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { loadEnv } from '../lib/env.js';

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

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fetch last 7 days of entries
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const entries = await sql`
    SELECT * FROM journey_entries
    WHERE created_at >= ${since}
    ORDER BY social_score DESC
  `;

  if (!entries.length) {
    console.log('No entries this week. Skipping digest.');
    return;
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
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await aiRes.json();
    digestContent = data.content?.[0]?.text || 'Failed to generate digest.';
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

  // Git commit
  try {
    execSync(`git add -A && git commit -m "digest: ${week} weekly summary"`, {
      cwd: BUILD_LOG, stdio: 'ignore', timeout: 10000
    });
  } catch {}

  // Mark entries as included in digest
  for (const entry of entries) {
    try {
      await sql`UPDATE journey_entries SET digest_included_in = ${week} WHERE id = ${entry.id}`;
    } catch {}
  }

  // Send email via Resend (if configured)
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
          from: 'Journey Logger <journal@whateverai.com>',
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

main().catch(console.error);
