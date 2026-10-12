"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createVideo, type CreateVideoState } from "./actions";

const MAX_ZIP_MB = 50; // Supabase free-plan per-file limit
const MAX_ASSETS = 8;
const ASSET_TYPES = "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime";
const clean = (name: string) => name.replace(/[^\w.\-]+/g, "_").slice(-80);

const STEPS = [
  { label: "The story", lead: "What are we launching? Describe it like you would to a designer." },
  { label: "The code", lead: "Where the agent reads the project from." },
  { label: "Real screens", lead: "Optional — the more real material, the more real the video." },
  { label: "Format", lead: "How long, which look, and whether you review along the way." },
  { label: "Ready", lead: "Check it over, then start the agent." },
] as const;

interface Summary { project: string; title: string; brief: string; code: string; screens: string; length: string; style: string; review: boolean }

// One form, shown a step at a time: every field stays in the DOM (so files and
// values survive going back), only the current step is visible, and each step
// is checked before the next one opens.
export function NewVideoForm() {
  const [state, formAction, pending] = useActionState<CreateVideoState, FormData>(createVideo, { error: null });
  const [source, setSource] = useState<"repo" | "zip">("repo");
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const last = STEPS.length - 1;

  /** First invalid field of a step, if any. */
  const invalidIn = (i: number) => {
    const fields = form.current?.querySelectorAll<HTMLInputElement>(`[data-step="${i}"] :is(input, textarea, select)`) ?? [];
    return [...fields].find((f) => !f.checkValidity()) ?? null;
  };

  function read(): Summary {
    const fd = new FormData(form.current!);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const zip = fd.get("zip") as File | null;
    const refs = (fd.getAll("assets") as File[]).filter((f) => f.size > 0).length;
    const screens = [s("live_url") && `Live site ${s("live_url")}`, s("login_user") && "test login", refs && `${refs} file${refs > 1 ? "s" : ""}`]
      .filter(Boolean).join(" · ");
    return {
      project: s("project"), title: s("title"), brief: s("brief"),
      code: source === "repo" ? s("repo_url") : zip?.name || "—",
      screens: screens || "The agent finds them itself (boots the app, or recreates the screens)",
      length: `${s("duration_s")} seconds`,
      style: { auto: "The agent chooses", template: "Ink Press template", free: "Free creation, in your brand" }[s("style") as "auto"] ?? s("style"),
      review: fd.get("review") === "on",
    };
  }

  function goTo(target: number) {
    setLocalError(null);
    // Going forward: every step on the way must be complete.
    for (let k = step; k < target; k++) {
      const bad = invalidIn(k);
      if (bad) {
        setStep(k);
        requestAnimationFrame(() => bad.reportValidity());
        return;
      }
    }
    if (target === last) setSummary(read());
    setStep(target);
    setReached((r) => Math.max(r, target));
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[data-step="${target}"] :is(input, textarea, select)`)?.focus({ preventScroll: true }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Enter on an earlier step means "next", not "submit".
    if (step < last) return goTo(step + 1);
    // Something earlier was cleared after it was checked: go back there and say what.
    for (let k = 0; k < last; k++) {
      const bad = invalidIn(k);
      if (bad) { setStep(k); requestAnimationFrame(() => bad.reportValidity()); return; }
    }
    setLocalError(null);
    const fd = new FormData(e.currentTarget);
    const batch = crypto.randomUUID();
    // The Supabase client (uploads) is only needed now -- not in the page's first load.
    const supabase = () => import("@/lib/supabase/client").then((m) => m.createClient());
    const refs = (fd.getAll("assets") as File[]).filter((f) => f.size > 0);
    if (refs.length > MAX_ASSETS) return setLocalError(`Attach at most ${MAX_ASSETS} screenshots or recordings.`);
    const tooBig = refs.find((f) => f.size > MAX_ZIP_MB * 1024 * 1024);
    if (tooBig) return setLocalError(`${tooBig.name} is over ${MAX_ZIP_MB} MB -- trim the recording or export it smaller.`);
    if (refs.some((f) => !ASSET_TYPES.split(",").includes(f.type))) return setLocalError("Screenshots must be PNG, JPEG or WebP; recordings MP4, WebM or MOV.");

    if (source === "zip") {
      const file = fd.get("zip") as File | null;
      if (!file || !file.size) return setLocalError("Choose a .zip of the project.");
      if (!file.name.toLowerCase().endsWith(".zip")) return setLocalError("The file must be a .zip.");
      if (file.size > MAX_ZIP_MB * 1024 * 1024) {
        return setLocalError(`That zip is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${MAX_ZIP_MB} MB. Leave out node_modules, build output and media, or use the GitHub repo option.`);
      }
      setUploading(true);
      const path = `${batch}/${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await (await supabase()).storage.from("uploads").upload(path, file, { contentType: "application/zip" });
      setUploading(false);
      if (error) return setLocalError(`Upload failed: ${error.message}`);
      fd.set("zip_path", path);
    }
    if (refs.length) {
      setUploading(true);
      const client = await supabase();
      const uploaded = await Promise.all(refs.map(async (f, i) => {
        const path = `${batch}/ref${i + 1}-${clean(f.name)}`;
        const { error } = await client.storage.from("uploads").upload(path, f, { contentType: f.type });
        return error ? { error: `${f.name}: ${error.message}` } : { path, kind: f.type.startsWith("video/") ? "video" : "image", size: f.size };
      }));
      setUploading(false);
      const failed = uploaded.find((u) => "error" in u);
      if (failed && "error" in failed) return setLocalError(`Upload failed -- ${failed.error}`);
      fd.set("asset_paths", JSON.stringify(uploaded));
    }
    fd.delete("zip");
    fd.delete("assets");
    startTransition(() => formAction(fd));
  }

  const busy = pending || uploading;
  const error = localError ?? state.error;
  const panel = (i: number) => ({ "data-step": i, hidden: step !== i, className: "wizard-panel", "aria-labelledby": `step-${i}` });

  return (
    <form ref={form} onSubmit={onSubmit} noValidate className="wizard" aria-busy={busy}>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.label} className={i === step ? "now" : i < step || i <= reached ? "done" : ""}>
            <button type="button" onClick={() => goTo(i)} disabled={i > reached && i > step + 1}
              aria-current={i === step ? "step" : undefined}>
              <span className="dot">{i < step ? "✓" : i + 1}</span>
              <span className="lbl">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="card wizard-card">
        <div className="wizard-meter" aria-hidden="true"><span style={{ width: `${(step / last) * 100}%` }} /></div>
        <p className="eyebrow">Step {step + 1} of {STEPS.length}</p>
        <h2 className="wizard-title">{STEPS[step].label}</h2>
        <p className="lede" style={{ margin: "0 0 1.4rem" }}>{STEPS[step].lead}</p>
        {error && <p className="alert err" role="alert" style={{ marginBottom: "1rem" }}>{error}</p>}

        <section {...panel(0)}>
          <h3 id="step-0" className="sr-only">The story</h3>
          <div className="stack">
            <div className="row2">
              <label>Project
                <input name="project" list="projects" required maxLength={120} placeholder="e.g. Agentora" />
              </label>
              <label>Video title
                <input name="title" required maxLength={160} placeholder="e.g. WhatsApp linking launch" />
              </label>
            </div>
            <label>What should the video show?
              <textarea name="brief" required minLength={10}
                placeholder="We just released WhatsApp account linking. Show a user connecting their WhatsApp in two steps and receiving their first message in the inbox. 30 seconds, upbeat." />
            </label>
          </div>
        </section>

        <section {...panel(1)}>
          <h3 id="step-1" className="sr-only">The code</h3>
          <div className="stack">
            <div className="choice-cards" role="radiogroup" aria-label="Where is the code?">
              <label className={`choice${source === "repo" ? " on" : ""}`}>
                <input type="radio" name="source" value="repo" checked={source === "repo"} onChange={() => setSource("repo")} />
                <b>GitHub repo</b><span className="muted small">A public repository URL</span>
              </label>
              <label className={`choice${source === "zip" ? " on" : ""}`}>
                <input type="radio" name="source" value="zip" checked={source === "zip"} onChange={() => setSource("zip")} />
                <b>Upload a zip</b><span className="muted small">Up to {MAX_ZIP_MB} MB, without node_modules</span>
              </label>
            </div>
            {source === "repo" ? (
              <label>Public repo URL
                <input name="repo_url" type="url" required placeholder="https://github.com/owner/repo" />
              </label>
            ) : (
              <label>Project zip <span className="hint">Leave out node_modules, build output and media.</span>
                <input name="zip" type="file" accept=".zip,application/zip" required />
              </label>
            )}
          </div>
        </section>

        <section {...panel(2)}>
          <h3 id="step-2" className="sr-only">Real screens</h3>
          <div className="stack">
            <label>Live URL <span className="hint">The most reliable way to get real screenshots.</span>
              <input name="live_url" type="url" placeholder="https://app.example.com" />
            </label>
            <details className="more">
              <summary>Add a test login <span className="hint">— if the feature is behind sign-in</span></summary>
              <div className="stack">
                <span className="hint">Use a demo account. The password goes only to the agent for this one job — it is never saved here, never shown in the job log, and is deleted when the job ends.</span>
                <label>Login page
                  <input name="login_url" type="url" placeholder="https://app.example.com/login" />
                </label>
                <div className="row2">
                  <label>Email or username
                    <input name="login_user" autoComplete="off" spellCheck={false} />
                  </label>
                  <label>Password
                    <input name="login_password" type="password" autoComplete="new-password" />
                  </label>
                </div>
              </div>
            </details>
            <details className="more">
              <summary>Add screenshots or a screen recording <span className="hint">— your own material</span></summary>
              <div className="stack">
                <label>Files <span className="hint">Up to {MAX_ASSETS} — PNG, JPEG, WebP, MP4, WebM or MOV, {MAX_ZIP_MB} MB each.</span>
                  <input name="assets" type="file" multiple accept={ASSET_TYPES} />
                </label>
                <label>What do they show?
                  <input name="assets_note" maxLength={500} placeholder="e.g. the inbox after linking WhatsApp; the recording is the full setup flow" />
                </label>
              </div>
            </details>
            <p className="hint" style={{ margin: 0 }}>Nothing here? That&apos;s fine — the agent boots your app with sample data, or recreates the screens from the code.</p>
          </div>
        </section>

        <section {...panel(3)}>
          <h3 id="step-3" className="sr-only">Format</h3>
          <div className="stack">
            <div className="row2">
              <label>Length
                <select name="duration_s" defaultValue="30">
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="45">45 seconds</option>
                  <option value="60">60 seconds</option>
                </select>
              </label>
              <label>Style
                <select name="style" defaultValue="auto">
                  <option value="auto">Let the agent choose</option>
                  <option value="template">Ink Press template (paper &amp; ink)</option>
                  <option value="free">Free creation (follows your brand)</option>
                </select>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" name="review" defaultChecked />
              <span>Let me review the feature summary and the storyboard before the video is built
                <span className="hint"> — recommended; you approve or ask for changes at each step</span></span>
            </label>
          </div>
        </section>

        <section {...panel(4)}>
          <h3 id="step-4" className="sr-only">Ready</h3>
          {summary && (
            <dl className="summary">
              <dt>Project</dt><dd>{summary.project}</dd>
              <dt>Title</dt><dd>{summary.title}</dd>
              <dt>The story</dt><dd className="clip3">{summary.brief}</dd>
              <dt>Code</dt><dd>{summary.code}</dd>
              <dt>Screens</dt><dd>{summary.screens}</dd>
              <dt>Format</dt><dd>{summary.length} · {summary.style}</dd>
              <dt>Reviews</dt><dd>{summary.review ? "You approve the brief and the storyboard" : "Straight through to the video"}</dd>
            </dl>
          )}
          <p className="hint" style={{ margin: "1rem 0 0" }}>A 30-second video usually takes 20–40 minutes, including your reviews. You can leave this page — it keeps going.</p>
        </section>

        <div className="wizard-nav">
          {step > 0 ? <button type="button" className="btn ghost" onClick={() => goTo(step - 1)} disabled={busy}>← Back</button> : <span />}
          {step < last ? (
            <button type="submit" className="btn primary lg">{step === 2 ? "Next — format" : "Next"} →</button>
          ) : (
            <button type="submit" className="btn primary lg" disabled={busy}>
              {uploading ? "Uploading files…" : pending ? "Starting the agent…" : "Make the video"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
