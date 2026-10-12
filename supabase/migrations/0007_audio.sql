-- =============================================================================
-- Sound: the voice-over voice, music mood and sound-design level the user
-- chose for a video. What the agent actually used (track, VO script) lives in
-- state->'audio' (job.json); the next video avoids those tracks.
-- =============================================================================

alter table public.videos add column if not exists audio jsonb;

comment on column public.videos.audio is
  '{ voice: "aura-2-<name>-en" | null, music: auto|upbeat|corporate|cinematic|calm|electronic|hiphop|none, sfx: subtle|punchy|off }';
