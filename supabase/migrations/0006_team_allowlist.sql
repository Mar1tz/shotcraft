-- =============================================================================
-- "Signed in" no longer means "on the team".
--
-- 0001 trusted that sign-ups were switched off in the Supabase dashboard. They
-- were not (auth settings: disable_signup = false), and the anon key ships in
-- the browser bundle -- so once the app is public, anyone could register with
-- their own email and read every project, video and uploaded code zip.
--
-- Now the team is an explicit list that only the service role can change
-- (scripts/invite.mjs adds people). Every policy checks it, so a stray account
-- -- self-registered or otherwise -- sees and can do nothing. Still switch
-- sign-ups off in the dashboard (Auth -> Sign In / Providers).
-- =============================================================================

create table if not exists public.team_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
-- No policies on purpose: clients can't read or write it; the service role can.

create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where user_id = (select auth.uid()));
$$;
revoke all on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- Everyone who exists today was created by the team (the invite script).
insert into public.team_members (user_id) select id from auth.users on conflict do nothing;

drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using ((select public.is_team()));
drop policy if exists "users edit own profile" on public.profiles;
create policy "users edit own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id and (select public.is_team()))
  with check ((select auth.uid()) = id);

drop policy if exists "team manages projects" on public.projects;
create policy "team manages projects" on public.projects
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));

drop policy if exists "team manages videos" on public.videos;
create policy "team manages videos" on public.videos
  for all to authenticated using ((select public.is_team())) with check ((select public.is_team()));

drop policy if exists "team uses uploads and renders" on storage.objects;
create policy "team uses uploads and renders" on storage.objects
  for all to authenticated
  using (bucket_id in ('uploads', 'renders') and (select public.is_team()))
  with check (bucket_id in ('uploads', 'renders') and (select public.is_team()));
