-- =============================================================================
-- ShotCraft -- initial schema
--
-- Team model for the internal phase: everyone who can sign in is on the team
-- and sees everything. Sign-ups are meant to be OFF in Supabase (Auth ->
-- Sign In / Providers -> "Allow new users to sign up"); people are invited
-- with scripts/invite.mjs, so "authenticated" == "invited team member".
-- When outside customers arrive, the policies below change to per-owner/org.
-- =============================================================================

-- --- Profiles (one per auth user) ---------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Projects (a product we make videos about) --------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  repo_url    text,
  live_url    text,
  notes       text,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- --- Videos (one agent job each) ---------------------------------------------
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 160),
  brief         text not null,                     -- what to show, in the user's words
  source_type   text not null check (source_type in ('repo', 'zip')),
  repo_url      text,
  zip_path      text,                              -- object path in the `uploads` bucket
  live_url      text,
  status        text not null default 'draft'
                check (status in ('draft', 'queued', 'running', 'done', 'failed', 'cancelled')),
  agent_job_id  text unique,
  result        jsonb,                             -- {ok, text, turns, secs} from Agent Studio
  files         jsonb not null default '[]'::jsonb,-- [{path, size, mtime}] last synced
  error         text,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists videos_project_idx on public.videos (project_id);
create index if not exists videos_created_idx on public.videos (created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists videos_touch on public.videos;
create trigger videos_touch before update on public.videos
  for each row execute function public.touch_updated_at();

-- --- Row Level Security --------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.videos   enable row level security;

drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "users edit own profile" on public.profiles;
create policy "users edit own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "team manages projects" on public.projects;
create policy "team manages projects" on public.projects
  for all to authenticated using (true) with check (true);

drop policy if exists "team manages videos" on public.videos;
create policy "team manages videos" on public.videos
  for all to authenticated using (true) with check (true);

-- --- Live updates (the video page subscribes to its row) ----------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'videos') then
    alter publication supabase_realtime add table public.videos;
  end if;
end $$;

-- --- Storage: private buckets ------------------------------------------------
-- uploads: project zips from the browser (Agent Studio fetches them through a
--          short-lived signed URL).  renders: finished videos (milestone M5).
-- 50 MB is the Supabase free-plan ceiling per file; raise on a paid plan.
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800),
       ('renders', 'renders', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "team uses uploads and renders" on storage.objects;
create policy "team uses uploads and renders" on storage.objects
  for all to authenticated
  using (bucket_id in ('uploads', 'renders'))
  with check (bucket_id in ('uploads', 'renders'));
