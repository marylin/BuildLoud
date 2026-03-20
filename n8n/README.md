# n8n Workflows for Journey Logger

These workflows should be **built in the n8n UI** and exported here for version control.
The JSON files in this directory are reference exports — import them into n8n to get started,
then re-export after making changes.

---

## 1. PR Hook Workflow (`journey-pr-hook.json`)

Automatically journals GitHub pull request activity (opened and merged).

**Node chain:**

1. **GitHub Webhook** (trigger) — listens for `pull_request` events
2. **IF** (filter) — only process `action === 'opened'` OR `(action === 'closed' AND merged === true)`
3. **Code** ("Extract PR Data") — extracts `title`, `body`, `repo.name`, `head.ref`, `action`, `number`, `changed_files`
4. **HTTP Request** ("Haiku Summary") — POST to `https://api.anthropic.com/v1/messages` with PR context; returns JSON `{summary, type}`
5. **Code** ("Parse Response") — extracts `summary` and `type` from the Haiku response
6. **HTTP Request** ("Write to Supabase") — POST to `{{SUPABASE_URL}}/rest/v1/journey_entries` with the entry payload

The workflow only writes to Supabase. Local markdown sync is handled separately by
`scripts/sync-pr-entries.js` (run on-demand or via cron).

---

## 2. Weekly Digest Workflow (`journey-weekly-digest.json`)

Compiles the week's journal entries into a narrative digest and emails it.

**Node chain:**

1. **Cron Trigger** — fires every Monday at 8:00 AM
2. **HTTP Request** ("Supabase Query") — GET last 7 days of `journey_entries`, ordered by `social_score` desc
3. **HTTP Request** ("Haiku Digest") — POST to Anthropic API with entry summaries; generates week summary, top 5 moments, and suggested narratives
4. **HTTP Request** ("Resend Email") — POST to `https://api.resend.com/emails` with the digest HTML
5. **HTTP Request** ("Supabase Update") — PATCH each entry's `digest_included_in` field with the ISO week string

For local markdown output, use `scripts/generate-digest.js` instead (writes to `weekly/YYYY-WXX.md`
and git-commits the result).

---

## Required n8n Credentials

Configure these in **n8n Settings > Credentials** (never hardcode):

| Credential | Where to get it |
|---|---|
| **Anthropic API Key** | https://console.anthropic.com/settings/keys |
| **Supabase URL** | Project Settings > API > URL |
| **Supabase anon key** | Project Settings > API > anon/public key |
| **Resend API Key** | https://resend.com/api-keys |
| **GitHub Webhook Secret** | Repo Settings > Webhooks > Secret |

---

## Export / Import

**To export** (after editing in n8n UI):
1. Open the workflow in n8n
2. Click the **Workflow menu** (three dots or hamburger)
3. Select **Export** and save as the corresponding JSON file in this directory

**To import** (setting up a fresh n8n instance):
1. Open n8n dashboard
2. Go to **Workflows > Import**
3. Upload the JSON file
4. Configure credentials (they are not included in exports)
5. Activate the workflow
