"use client";

import { useEffect, useRef, useState } from "react";
import { FEATURED_VOICES, MUSIC_MOODS, SFX_LEVELS, voiceName, type MusicMood, type SfxLevel, type Voice } from "@/lib/audio";

// The wizard's sound step. Submits three fields with the form: `voice` (an
// Aura-2 id, or empty for no voice-over), `music` (a mood) and `sfx`.
// Voices load the first time the step opens; ▶ plays a short sample.
export function SoundPicker({ active }: { active: boolean }) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [narrate, setNarrate] = useState(true);
  const [voice, setVoice] = useState(FEATURED_VOICES[0]);
  const [music, setMusic] = useState<MusicMood>("auto");
  const [sfx, setSfx] = useState<SfxLevel>("subtle");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    fetch("/api/tts/voices")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`))))
      .then((list: Voice[]) => setVoices(list))
      .catch((e: Error) => { setVoicesError(e.message); setNarrate(false); });
  }, [active]);

  // Leaving the step stops the sample.
  useEffect(() => { if (!active) audio.current?.pause(); }, [active]);
  useEffect(() => () => audio.current?.pause(), []);

  function play(id: string) {
    setPlayError(null);
    const el = (audio.current ??= new Audio());
    if (playing === id || loading === id) { el.pause(); setPlaying(null); setLoading(null); return; }
    el.pause();
    el.onplaying = () => { setLoading(null); setPlaying(id); };
    el.onended = el.onpause = () => setPlaying((p) => (p === id ? null : p));
    el.onerror = () => { setLoading(null); setPlaying(null); setPlayError(`Couldn't play ${voiceName(id)} — try again in a moment.`); };
    setLoading(id);
    el.src = `/api/tts/preview?voice=${encodeURIComponent(id)}`;
    void el.play().catch(() => {});
  }

  const byId = new Map((voices ?? []).map((v) => [v.id, v]));
  const featured = FEATURED_VOICES.filter((id) => !voices || byId.has(id));
  const others = (voices ?? []).filter((v) => !FEATURED_VOICES.includes(v.id));
  const describe = (v?: Voice) => (v ? [v.accent, v.gender].filter(Boolean).join(" · ") : "");

  return (
    <div className="stack sound">
      <input type="hidden" name="voice" value={narrate ? voice : ""} />

      <div className="sound-block">
        <div className="sound-head">
          <div>
            <b>Voice-over</b>
            <span className="hint">The agent writes a script from your brief and a narrator reads it over the video.</span>
          </div>
          <label className="switch">
            <input type="checkbox" checked={narrate} disabled={Boolean(voicesError)}
              onChange={(e) => setNarrate(e.target.checked)} aria-label="Add a voice-over" />
            <span aria-hidden="true" />
          </label>
        </div>
        {voicesError && <p className="hint" style={{ margin: 0 }}>Voice-overs aren&apos;t available right now ({voicesError}). The video gets music and sound effects.</p>}
        {narrate && !voicesError && (
          <>
            <div className="voice-grid" role="radiogroup" aria-label="Narrator">
              {featured.map((id) => {
                const v = byId.get(id);
                const state = loading === id ? "loading" : playing === id ? "playing" : "";
                return (
                  <label key={id} className={`voice-card${voice === id ? " on" : ""}`}>
                    <input type="radio" name="voice_pick" value={id} checked={voice === id} onChange={() => setVoice(id)} />
                    <span className="voice-text">
                      <b>{voiceName(id)}</b>
                      <span className="voice-meta">{voices ? describe(v) : <i className="skeleton line" />}</span>
                      <span className="voice-tags">{v?.tags.slice(0, 2).join(", ")}</span>
                    </span>
                    <button type="button" className={`voice-play ${state}`} aria-label={`${state === "playing" ? "Stop" : "Play"} ${voiceName(id)}`}
                      onClick={(e) => { e.preventDefault(); play(id); }}>
                      {state === "playing" ? <PauseGlyph /> : <PlayGlyph />}
                    </button>
                  </label>
                );
              })}
            </div>
            {others.length > 0 && (
              <div className="voice-more">
                <label>More voices
                  <select value={FEATURED_VOICES.includes(voice) ? "" : voice} onChange={(e) => e.target.value && setVoice(e.target.value)}>
                    <option value="">{others.length} more — American, British, Australian…</option>
                    {others.map((v) => <option key={v.id} value={v.id}>{voiceName(v.id)} — {[describe(v), v.tags.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</option>)}
                  </select>
                </label>
                {!FEATURED_VOICES.includes(voice) && (
                  <button type="button" className="btn ghost sm" onClick={() => play(voice)}>
                    {playing === voice ? "■ Stop" : loading === voice ? "Loading…" : `▶ Play ${voiceName(voice)}`}
                  </button>
                )}
              </div>
            )}
            {playError && <p className="hint" role="status" style={{ margin: 0 }}>{playError}</p>}
          </>
        )}
      </div>

      <div className="sound-block" role="group" aria-labelledby="sound-music">
        <div className="sound-title" id="sound-music"><b>Music</b>
          <span className="hint">A different track every time — the agent skips the ones your recent videos used.</span></div>
        <div className="mood-grid" role="radiogroup" aria-labelledby="sound-music">
          {MUSIC_MOODS.map((m) => (
            <label key={m.id} className={`mood${music === m.id ? " on" : ""}${m.id === "none" ? " none" : ""}`}>
              <input type="radio" name="music" value={m.id} checked={music === m.id} onChange={() => setMusic(m.id)} />
              <b>{m.label}</b>
              <span>{m.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sound-block" role="group" aria-labelledby="sound-sfx">
        <div className="sound-title" id="sound-sfx"><b>Sound effects</b></div>
        <div className="seg" role="radiogroup" aria-labelledby="sound-sfx">
          {SFX_LEVELS.map((s) => (
            <label key={s.id} title={s.hint}>
              <input type="radio" name="sfx" value={s.id} checked={sfx === s.id} onChange={() => setSfx(s.id)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        <span className="hint">{SFX_LEVELS.find((s) => s.id === sfx)?.hint}</span>
      </div>
    </div>
  );
}

const PlayGlyph = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>;
const PauseGlyph = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>;
