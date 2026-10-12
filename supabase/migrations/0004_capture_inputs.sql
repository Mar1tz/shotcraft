-- M4: what the capture ladder was given. The test login itself is never
-- stored here -- it goes straight to Agent Studio's per-job .secrets/ and is
-- deleted when the job ends; has_login only records that one was supplied.
alter table public.videos
  add column if not exists assets    jsonb   not null default '[]'::jsonb,  -- [{ path, name, kind, size }] in `uploads`
  add column if not exists has_login boolean not null default false;
