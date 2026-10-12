-- M5: the editor. edit_project is the workbench's project JSON (the user's
-- timeline edits, autosaved); exports are MP4s rendered from it.
alter table public.videos
  add column if not exists edit_project  jsonb,
  add column if not exists edit_saved_at timestamptz,
  add column if not exists exports       jsonb not null default '[]'::jsonb;  -- [{ id, path, bytes, created_at, storage_path? }]
