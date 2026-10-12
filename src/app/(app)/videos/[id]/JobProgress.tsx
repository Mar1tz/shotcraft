import { CAPTURE_LABEL, STAGES, type JobState } from "@/lib/types";

// Renders the recipe's job.json. Pure display -- LiveJob owns the polling.
/** `compact`: the track and the current step only, without the findings. */
export function JobProgress({ state, live = false, compact = false }: { state: JobState | null; live?: boolean; compact?: boolean }) {
  if (!state) {
    return <section className="card progress-card"><p className="muted small">Waiting for the agent to start the recipe…</p></section>;
  }
  // Review stages sit inside their parent stage on the tracker.
  const at = state.stage === "brief_review" ? "understand" : state.stage === "storyboard_review" ? "storyboard" : state.stage;
  const idx = STAGES.findIndex((s) => s.id === at);
  const failed = state.stage === "failed";
  const colors = state.brand?.colors;
  const swatches = [...new Set([colors?.primary, colors?.accent, colors?.background, colors?.text, ...(colors?.palette ?? [])]
    .filter((c): c is string => Boolean(c) && /^#[0-9a-f]{3,8}$/i.test(c!)))].slice(0, 8);

  return (
    <section className="card progress-card" aria-label="Progress">
      <ol className="stepper">
        {STAGES.map((s, i) => (
          <li key={s.id} className={i < idx || state.stage === "done" ? "done" : i === idx ? (failed ? "fail" : "now") : ""}>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress}>
        <span style={{ width: `${state.progress}%` }} />
      </div>
      <p className="now-label">
        {failed ? <span className="ev-result err">{state.error}</span> : <>
          {live && <span className="rec" aria-hidden="true" />}
          {state.label}
          <span className="tc muted" style={{ marginLeft: "auto" }}>{String(state.progress ?? 0).padStart(2, "0")}%</span>
        </>}
      </p>

      {state.awaiting && (
        <p className="alert ok"><b>The agent is waiting for you:</b> {state.awaiting.question} — answer below.</p>
      )}
      {state.warnings && state.warnings.length > 0 && (
        <ul className="warnings">{state.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}

      {!compact && (state.brief || state.brand || state.storyboard) && (
        <div className="findings">
          {state.brief && (
            <details open>
              <summary>Feature: <b>{state.brief.feature}</b></summary>
              {state.brief.one_liner && <p>{state.brief.one_liner}</p>}
              {state.brief.user_flow && state.brief.user_flow.length > 0 && (
                <ol className="small">{state.brief.user_flow.map((f) => <li key={f.step}>{f.action}</li>)}</ol>
              )}
              {state.brief.screens && state.brief.screens.length > 0 && (
                <p className="small muted">Screens: {state.brief.screens.map((s) => s.route ? `${s.name} (${s.route})` : s.name).join(" · ")}</p>
              )}
            </details>
          )}
          {state.brand && (
            <details>
              <summary>Brand: <b>{state.brand.name ?? "—"}</b>
                {swatches.length > 0 && <span className="swatches">{swatches.map((c) => <i key={c} style={{ background: c }} title={c} />)}</span>}
              </summary>
              <p className="small">{[state.brand.tagline, state.brand.ui_style, state.brand.tone && `Tone: ${state.brand.tone}`,
                state.brand.fonts?.heading && `Fonts: ${state.brand.fonts.heading}${state.brand.fonts.body ? ` / ${state.brand.fonts.body}` : ""}`]
                .filter(Boolean).join(" · ")}</p>
            </details>
          )}
          {state.capture?.method && (
            <p className="small muted">Screens: {CAPTURE_LABEL[state.capture.method] ?? state.capture.method}
              {state.capture.screens?.length ? ` (${state.capture.screens.length})` : ""}
              {state.capture.tried?.some((t) => !t.ok) ? ` — also tried ${state.capture.tried.filter((t) => !t.ok)
                .map((t) => CAPTURE_LABEL[t.method] ?? t.method).join(", ")}` : ""}</p>
          )}
          {state.storyboard?.shots && state.storyboard.shots.length > 0 && (
            <details>
              <summary>Storyboard: <b>{state.storyboard.shots.length} shots</b>
                {state.storyboard.duration_s ? ` · ${state.storyboard.duration_s}s` : ""}{state.storyboard.route ? ` · ${state.storyboard.route}` : ""}</summary>
              <ol className="small shots">
                {state.storyboard.shots.map((s) => (
                  <li key={s.id}><b>{s.seconds ? `${s.seconds}s` : ""}</b> {s.purpose}{s.on_screen_text ? ` — “${s.on_screen_text}”` : ""}
                    {s.vo && <span className="vo-line"><i>VO</i>{s.vo}</span>}</li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
