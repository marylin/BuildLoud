-- migrations/001-journey-entries.sql
-- Journey Logger: build-in-public journal entries
-- Run this in your Neon SQL editor or via psql

create table if not exists journey_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project text not null,
  type text not null check (type in (
    'feature', 'bugfix', 'refactor', 'exploration',
    'planning', 'infra', 'insight', 'blocker', 'milestone'
  )),
  source text not null check (source in ('stop_hook', 'pr_hook', 'manual_journal')),
  summary text not null,
  raw_input text,
  notable boolean not null default false,
  social_score int not null default 0 check (social_score >= 0 and social_score <= 10),
  tags text[] default '{}',
  metadata jsonb default '{}',
  digest_included_in text,
  seo_engine_pushed boolean not null default false
);

create index if not exists idx_journey_created on journey_entries(created_at desc);
create index if not exists idx_journey_score on journey_entries(social_score desc);
create index if not exists idx_journey_project on journey_entries(project);
create index if not exists idx_journey_milestone on journey_entries(project, type, created_at);
