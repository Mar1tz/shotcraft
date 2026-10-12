-- M3: a video paused at a checkpoint (brief or storyboard) is in "review" --
-- the agent is idle, waiting for the user, which is neither running nor done.
alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check
  check (status in ('draft', 'queued', 'running', 'review', 'done', 'failed', 'cancelled'));

-- Checkpoints on by default from now on (the form can still switch them off).
alter table public.videos alter column mode set default 'checkpoints';
