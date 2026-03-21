# Journal Humanizer Plan
<!-- linear: (pending) -->

## Summary
Add a humanization layer to Journey Logger that generates public-ready, non-technical versions of journal entries. Auto-generates at write time for entries scoring 5+, with tone driven by score (casual for 7+, professional for 5-6). Includes `/journal:publish` command for on-demand refinement. See `docs/superpowers/specs/2026-03-20-journal-humanizer-design.md`.

## Tasks
1. [S] Create `lib/humanize.js` -- core function with tone selection, hash-based idempotency, force/hint params, Haiku call via fetch, JS-based platform classification
2. [S] Write `tests/humanize.test.js` -- 9 unit tests: threshold skip, tone routing (x2), idempotency, force bypass, hint injection, hash invalidation, API failure resilience, platform classification
3. [S] Integrate into `lib/write-entry.js` -- add step 3.5 (humanize before markdown write), import humanize module, try/catch non-blocking
4. [S] Update `tests/write-entry.test.js` -- add 2 integration tests: score 7+ has public_summary, score 3 has no public_summary
5. [S] Update `scripts/sync-pr-entries.js` -- call humanize() on fetched entries, persist humanized metadata back to DB via UPDATE
6. [S] Create `/journal:publish` skill -- read entries, filter by score/date, show public_summary, accept hints, regenerate with force, output copy-paste text
7. [S] Update `tests/integration.test.js` -- add end-to-end test for humanized entry in full pipeline
8. [S] Run full test suite -- all existing 46 + new tests must pass

## Dependencies
- Task 1 must complete before tasks 2-7
- Task 8 runs last
