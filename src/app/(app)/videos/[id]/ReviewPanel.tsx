"use client";

import { useState } from "react";
import type { JobState } from "@/lib/types";

// Shown when the recipe pauses at a checkpoint (job.json "awaiting"). The
// user's answer goes back to the same agent conversation as a message; the
// details being reviewed are in the progress panel above.
export function ReviewPanel({ id, state, onSent, onShowBrief }: { id: string; state: JobState; onSent: () => void; onShowBrief?: () => void }) {
  const [changes, setChanges] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = state.awaiting?.kind ?? "brief";
  const label = kind === "brief" ? "feature summary" : "storyboard";
  const screens = (state.capture?.screens ?? []).filter((s) => s.file);

  async function send(text: string) {
    setSending(true);
    setError(null);
    const r = await fetch(`/api/videos/${id}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    setSending(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Could not send"); return; }
    setChanges("");
    onSent();
  }

  const approve = kind === "brief"
    ? "Approved: the feature summary is right. Continue with screen capture and the storyboard."
    : "Approved: build the video from this storyboard.";

  return (
    <section className="card review stack" aria-label={`Review the ${label}`}>
      <span className="eyebrow">Your turn · checkpoint</span>
      <h2 style={{ margin: 0 }}>Review the {label}</h2>
      <p style={{ margin: 0 }}>{state.awaiting?.question || `Does this ${label} look right?`}</p>
      <p className="muted small" style={{ margin: 0 }}>
        {onShowBrief
          ? <>The {kind === "storyboard" ? "shot list" : "feature, flow and screens"} are in the <button type="button" className="linkish" onClick={onShowBrief}>Brief tab</button>.</>
          : <>The details are in the panel above{kind === "storyboard" ? " (open “Storyboard”)" : " (feature, flow and screens)"}.</>}
      </p>

      {kind === "storyboard" && screens.length > 0 && (
        <div className="thumbs">
          {screens.map((s) => {
            const url = `/api/videos/${id}/download?path=${encodeURIComponent(s.file!)}&inline=1`;
            return (
              <a key={s.name} href={url} target="_blank" rel="noreferrer" title={s.route || s.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, session-gated file */}
                <img src={url} alt={`Captured screen: ${s.name}`} loading="lazy" />
                <span>{s.name}</span>
              </a>
            );
          })}
        </div>
      )}

      {error && <p className="alert err" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={sending} onClick={() => send(approve)}>
          {sending ? "Sending…" : "Approve and continue"}
        </button>
      </div>
      <label>Or describe what should change
        <textarea value={changes} onChange={(e) => setChanges(e.target.value)} disabled={sending}
          placeholder={kind === "brief"
            ? "e.g. The feature is the WhatsApp settings page, not the onboarding modal. Skip the pricing screen."
            : "e.g. Open on the inbox instead of the logo. Make the ending 3 seconds longer."} />
      </label>
      <div className="actions">
        <button className="btn" disabled={sending || changes.trim().length < 3}
          onClick={() => send(`Changes requested to the ${label}: ${changes.trim()}\nApply them, show me the updated ${label}, and ask again.`)}>
          Send changes
        </button>
      </div>
    </section>
  );
}
