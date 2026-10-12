"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoExport } from "@/lib/types";

// Hosts video-shotcraft's workbench (built per video by Agent Studio) in a
// sandboxed iframe -- opaque origin, no access to this page or the session.
// The iframe talks to this page only through postMessage:
//   wb:hello            -> we answer wb:init with the saved project (or null)
//   wb:save {project}   -> autosave to the database
//   wb:rpc  {method}    -> export.start / export.status / export.reveal

type Build = { state: "none" | "queued" | "building" | "ready" | "failed"; step?: string; error?: string; log?: string[] };
type Save = { kind: "idle" | "pending" | "saving" | "saved" | "error"; at?: string | null; error?: string };
type Render = { id: string; progress: number; lastLine?: string };

const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

/** `embedded`: inside the video workspace's Edit tab instead of full screen. */
export function EditorFrame({ videoId, title, token, project, savedAt, initialExports, embedded = false }: {
  videoId: string; title: string; token: string; project: string | null; savedAt: string | null; initialExports: VideoExport[]; embedded?: boolean;
}) {
  const api = `/api/videos/${videoId}`;
  const [build, setBuild] = useState<Build>({ state: "none", step: "Checking the editor…" });
  const [attempt, setAttempt] = useState<{ n: number; force: boolean }>({ n: 0, force: false });
  const [frameKey, setFrameKey] = useState(0);
  const [save, setSave] = useState<Save>(savedAt ? { kind: "saved", at: savedAt } : { kind: "idle" });
  const [exports, setExports] = useState(initialExports);
  const [rendering, setRendering] = useState<Render | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const projectRef = useRef(project);
  const pending = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retry = useRef<() => void>(() => {});

  // Build the editor (Agent Studio reuses a build whose video hasn't changed), then poll.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async (r: Response): Promise<Build> => {
      const j = await r.json().catch(() => ({}));
      return r.ok || r.status === 202 ? j : { state: "failed", error: j.error || `Agent Studio answered ${r.status}` };
    };
    const poll = async () => {
      const st = await read(await fetch(`${api}/editor`, { cache: "no-store" }));
      if (stop) return;
      setBuild(st);
      if (st.state === "queued" || st.state === "building") timer = setTimeout(poll, 2500);
    };
    (async () => {
      const st = await read(await fetch(`${api}/editor`, { method: "POST", body: JSON.stringify({ force: attempt.force }) }));
      if (stop) return;
      setBuild(st);
      if (st.state === "queued" || st.state === "building") timer = setTimeout(poll, 2000);
    })().catch((e) => !stop && setBuild({ state: "failed", error: String(e) }));
    return () => { stop = true; clearTimeout(timer); };
  }, [api, attempt]);

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setSave({ kind: "saving" });
    try {
      const r = await fetch(`${api}/editor/project`, { method: "PUT", body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setSave({ kind: "saved", at: j.saved_at });
    } catch (e) {
      pending.current ??= body;            // keep it for the next try
      setSave({ kind: "error", error: e instanceof Error ? e.message : String(e) });
      saveTimer.current = setTimeout(() => retry.current(), 5000);
    }
  }, [api]);
  useEffect(() => { retry.current = () => void flush(); }, [flush]);

  const download = useCallback((rid: string) => {
    const a = document.createElement("a");
    a.href = `${api}/download?path=${encodeURIComponent(`editor/renders/${rid}.mp4`)}`;
    a.download = `${title.replace(/[^\w.-]+/g, "_")}-${rid}.mp4`;
    a.click();
  }, [api, title]);

  useEffect(() => {
    const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, "*");
    const onMessage = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { type?: string; id?: number; method?: string; project?: unknown; body?: { id?: string; project?: unknown } };
      if (d?.type === "wb:hello") {
        post({ type: "wb:init", project: projectRef.current });
      } else if (d?.type === "wb:save" && typeof d.project === "string") {
        projectRef.current = d.project;
        pending.current = d.project;
        setSave({ kind: "pending" });
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void flush(), 1200);
      } else if (d?.type === "wb:rpc") {
        const reply = (status: number, body: unknown) => post({ type: "wb:rpc-result", id: d.id, status, body });
        try {
          if (d.method === "export.start") {
            void flush();
            const r = await fetch(`${api}/editor/renders`, { method: "POST", body: JSON.stringify({ project: d.body?.project }) });
            const j = await r.json().catch(() => ({}));
            if (r.ok) setRendering({ id: j.id, progress: 0, lastLine: "Starting…" });
            reply(r.ok ? 200 : r.status, r.ok ? { id: j.id } : { error: j.error || "The export didn't start" });
          } else if (d.method === "export.status" && d.body?.id) {
            const rid = d.body.id;
            const r = await fetch(`${api}/editor/renders/${encodeURIComponent(rid)}`, { cache: "no-store" });
            const j = await r.json().catch(() => ({}));
            if (r.ok) {
              setRendering(j.status === "running" ? { id: rid, progress: j.progress ?? 0, lastLine: j.lastLine } : null);
              if (j.status === "done") {
                setExports((xs) => (xs.some((x) => x.id === rid) ? xs
                  : [...xs, { id: rid, path: j.output, bytes: j.bytes ?? 0, created_at: j.finished_at ?? new Date().toISOString() }]));
              }
            }
            reply(r.status, j);
          } else if (d.method === "export.reveal" && d.body?.id) {
            download(d.body.id);              // the workbench's "show in Finder" = download here
            reply(200, { ok: true });
          } else {
            reply(400, { error: "Unknown request" });
          }
        } catch (err) {
          reply(502, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    // Leaving with an unsaved edit: send it anyway (keepalive survives the unload).
    const onHide = () => {
      if (!pending.current) return;
      void fetch(`${api}/editor/project`, { method: "PUT", body: pending.current, keepalive: true });
      pending.current = null;
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onHide);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("pagehide", onHide); onHide(); };
  }, [api, flush, download]);

  async function startOver() {
    if (!confirm("Throw away your edits and start again from the agent's cut?")) return;
    clearTimeout(saveTimer.current);
    pending.current = null;
    await fetch(`${api}/editor/project`, { method: "DELETE" });
    projectRef.current = null;
    setSave({ kind: "idle" });
    setFrameKey((k) => k + 1);
  }

  const latest = exports.at(-1);
  const saveLabel = { idle: "Not edited yet", pending: "Unsaved changes", saving: "Saving…",
    saved: `Saved ${time(save.at)}`, error: `Couldn't save — retrying (${save.error})` }[save.kind];

  return (
    <div className={embedded ? "editor-embed" : "editor-shell"}>
      <header className="editor-bar">
        {embedded
          ? <span className="title muted">Manual edit · timeline</span>
          : <Link href={`/videos/${videoId}`} className="btn">← Video</Link>}
        {!embedded && <span className="title" title={title}>{title}</span>}
        {build.state === "ready" && <span className={`save-state ${save.kind}`} aria-live="polite">{saveLabel}</span>}
        {rendering && <span className="save-state">Exporting {Math.round(rendering.progress * 100)}%</span>}
        {latest && !rendering && (
          <button className="btn" onClick={() => download(latest.id)} title={`Exported ${new Date(latest.created_at).toLocaleString()}`}>
            Download export{exports.length > 1 ? ` (${exports.length})` : ""}
          </button>
        )}
        {build.state === "ready" && (
          <>
            <button className="btn" onClick={startOver} disabled={save.kind === "idle"}>Start over</button>
            <button className="btn" onClick={() => setAttempt((a) => ({ n: a.n + 1, force: true }))}
              title="Rebuild the editor from the agent's latest version of the video">Rebuild</button>
            {embedded && <Link className="btn" href={`/videos/${videoId}/edit`} title="Open the editor full screen">⤢ Full screen</Link>}
          </>
        )}
      </header>

      {build.state === "ready" ? (
        <iframe
          key={frameKey}
          ref={frame}
          className="editor-frame"
          title={`Editor — ${title}`}
          src={`/e/${token}/index.html?import=project`}
          sandbox="allow-scripts allow-downloads allow-modals"
          allow="autoplay; fullscreen; clipboard-write"
        />
      ) : (
        <div className="editor-wait" aria-live="polite">
          {build.state === "failed" ? (
            <div className="stack" style={{ maxWidth: 560 }}>
              <p className="alert err">The editor couldn&apos;t be prepared: {build.error}</p>
              {build.log?.length ? <pre className="log">{build.log.slice(-8).join("\n")}</pre> : null}
              <div><button className="btn primary" onClick={() => setAttempt((a) => ({ n: a.n + 1, force: true }))}>Try again</button></div>
            </div>
          ) : (
            <div className="stack" style={{ justifyItems: "center" }}>
              <div className="spinner" aria-hidden="true" />
              <p>{build.step || "Preparing the editor…"}</p>
              <p className="muted small">The first time for each video takes up to a minute; after that it opens instantly.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
