-- M2: the shotcraft-job recipe reports its progress in the job's job.json; the
-- app mirrors the useful parts here so lists and pages render without asking
-- Agent Studio, and so they survive the job workspace being cleaned up.
alter table public.videos
  add column if not exists mode       text not null default 'auto'
    check (mode in ('auto', 'checkpoints')),
  add column if not exists style      text not null default 'auto'
    check (style in ('auto', 'template', 'free')),
  add column if not exists duration_s integer not null default 30
    check (duration_s between 5 and 180),
  add column if not exists stage      text,                 -- job.json "stage"
  add column if not exists progress   integer not null default 0
    check (progress between 0 and 100),
  add column if not exists stage_label text,                -- job.json "label"
  add column if not exists state      jsonb;                -- last job.json snapshot
