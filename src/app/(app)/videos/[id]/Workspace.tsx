"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CAPTURE_LABEL, STATUS_LABEL, type JobState, type VideoExport, type VideoFile, type VideoStatus } from "@/lib/types";
import { JobProgress } from "./JobProgress";
import { ReviewPanel } from "./ReviewPanel";
import { EditorFrame } from "./edit/EditorFrame";
import { Icon, type IconName } from "@/components/Icon";

// The video workspace: chat with the agent on the left, the film on the
// right -- preview, manual timeline edit, files and the brief as tabs.

// Agent Studio event shapes (see Agent Studio's server.mjs).
type Ev =
  | { t: "user"; text: string; i?: number }
  | { t: "status"; text: string; i?: number }
  | { t: "text"; text: string; sub?: boolean; i?: number }
  | { t: "tool"; id: string; name: string; input: string; sub?: boolean; i?: number }
  | { t: "tool_result"; id: string; ok: boolean; output: string; i?: number }
  | { t: "result"; ok: boolean; text?: string; turns?: number; secs?: number; i?: number }
  | { t: "delta"; text: string } | { t: "note"; text: string } | { t: "job_status"; status: string }
  | { t: "busy" } | { t: "idle" };
type ToolEv = Extract<Ev, { t: "tool" }>;

/** What the chat shows: bubbles, a collapsed run of tool steps, system lines. */
type Item =
  | { k: "job"; key: string }
  | { k: "user" | "agent"; key: string; text: string }
  | { k: "steps"; key: string; tools: ToolEv[] }
  | { k: "sys"; key: string; text: string }
  | { k: "error"; key: string; text: string };

export interface WorkspaceVideo {
  id: string; title: string; project: string | null; status: VideoStatus; files: VideoFile[]; state: JobState | null;
  hasJob: boolean; brief: string; source: string; liveUrl: string | null; hasLogin: boolean; attached: string[];
  createdAt: string; error: string | null; durationS: number; style: string; mode: string; exports: VideoExport[];
}
export interface WorkspaceEditor { token: string; project: string | null; savedAt: string | null }

const VIDEO = /\.(mp4|webm|mov)$/i;
const FEED_MAX = 400;
const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const secs = (s: number) => (s < 90 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const timecode = (s: number) => `00:${String(s).padStart(2, "0")}`;
const TABS: { id: "preview" | "edit" | "files" | "brief"; label: string; icon: IconName }[] = [
  { id: "preview", label: "Preview", icon: "play" },
  { id: "edit", label: "Edit", icon: "edit" },
  { id: "files", label: "Files", icon: "folder" },
  { id: "brief", label: "Brief", icon: "doc" },
];
const SUGGESTIONS = [
  "Make it 20 seconds",
  "Give it a darker, more cinematic look",
  "End on a stronger call to action",
  "Slow down the dashboard shot",
];

function toItems(events: Ev[]): Item[] {
  const out: Item[] = [];
  for (const ev of events) {
    const key = `e${"i" in ev ? ev.i : out.length}`;
    if (ev.t === "user") out.push(ev.i === 0 ? { k: "job", key } : { k: "user", key, text: ev.text });
    else if (ev.t === "text" && !ev.sub && ev.text.trim()) out.push({ k: "agent", key, text: ev.text.trim() });
    else if (ev.t === "tool") {
      const prev = out.at(-1);
      if (prev?.k === "steps") prev.tools.push(ev);
      else out.push({ k: "steps", key, tools: [ev] });
    } else if (ev.t === "status") {
      // "cc/claude-opus-5-5 · 2 skill(s) on" is plumbing, not news.
      if (!/skill\(s\) on|^[\w-]+\/[\w.-]+ ·/.test(ev.text)) out.push({ k: "sys", key, text: ev.text });
    }
    else if (ev.t === "result") {
      out.push(ev.ok
        ? { k: "sys", key, text: `Finished${ev.turns ? ` · ${ev.turns} steps` : ""}${ev.secs ? ` · ${secs(ev.secs)}` : ""}` }
        : { k: "error", key, text: ev.text || "The agent stopped with an error." });
    }
  }
  return out;
}

export function Workspace({ video, editor }: { video: WorkspaceVideo; editor: WorkspaceEditor }) {
  const { id } = video;
  const router = useRouter();
  const [events, setEvents] = useState<Ev[]>([]);
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [typing, setTyping] = useState("");
  const [status, setStatus] = useState<VideoStatus>(video.status);
  const [files, setFiles] = useState<VideoFile[]>(video.files);
  const [jobState, setJobState] = useState<JobState | null>(video.state);
  const [note, setNote] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"preview" | "edit" | "files" | "brief">("preview");
  const [editOpened, setEditOpened] = useState(false);
  const [pane, setPane] = useState<"chat" | "video">("video");      // phones: one side at a time
  const [allFiles, setAllFiles] = useState(false);
  const stored = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const sync = useCallback(async () => {
    const r = await fetch(`/api/videos/${id}/sync`, { method: "POST" });
    if (!r.ok) return;
    const s = await r.json();
    setStatus(s.status);
    setFiles(s.files ?? []);
    router.refresh();
  }, [id, router]);

  const loadState = useCallback(async () => {
    const r = await fetch(`/api/videos/${id}/state`);
    if (!r.ok) return;
    const { state } = await r.json();
    if (state) setJobState(state);
  }, [id]);

  const working = status === "running" || status === "queued";
  useEffect(() => {
    if (!video.hasJob || !working) return;
    const t = setInterval(loadState, 8000);
    return () => clearInterval(t);
  }, [video.hasJob, working, loadState]);

  // The conversation: replayed from the start, then live. Commit once per frame.
  useEffect(() => {
    if (!video.hasJob) return;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let pending: Ev[] = [];
    let pendingTools: Record<string, boolean> = {};
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (pending.length) { const add = pending; pending = []; setEvents((list) => [...list, ...add].slice(-FEED_MAX)); }
      if (Object.keys(pendingTools).length) { const t = pendingTools; pendingTools = {}; setTools((x) => ({ ...x, ...t })); }
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(flush); };
    const open = () => {
      es = new EventSource(`/api/videos/${id}/stream?from=${stored.current}`);
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data) as Ev;
        if ("i" in ev && typeof ev.i === "number") {
          if (ev.i < stored.current) return;
          stored.current = ev.i + 1;
        }
        switch (ev.t) {
          case "delta": setTyping((t) => t + ev.text); return;
          case "note": setNote(ev.text); return;
          case "busy": setStatus("running"); setNote(null); return;
          case "job_status": if (ev.status === "queued") setStatus("queued"); return;
          case "idle": setTyping(""); setNote(null); void sync(); void loadState(); return;
          case "tool_result": pendingTools[ev.id] = ev.ok; later(); return;
          case "text": if (!ev.sub) setTyping(""); break;
        }
        pending.push(ev);
        later();
      };
      es.onerror = () => { es?.close(); if (!closed) retry = setTimeout(open, 3000); };
    };
    open();
    return () => { closed = true; clearTimeout(retry); cancelAnimationFrame(frame); es?.close(); };
  }, [id, video.hasJob, sync, loadState]);

  const items = useMemo(() => toItems(events), [events]);

  // Open at the latest message, then follow along while the reader stays at
  // the bottom (scrolling up to read history stops the following).
  // The history replays over several frames: jump (not glide) to the end
  // until it has settled, a moment after the first messages arrive.
  const settled = useRef<"no" | "settling" | "yes">("no");
  useEffect(() => {
    const el = feed.current;
    if (!el || !items.length) return;
    if (settled.current !== "yes") {
      el.scrollTop = el.scrollHeight;
      if (settled.current === "no") { settled.current = "settling"; setTimeout(() => { settled.current = "yes"; }, 1500); }
      return;
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, typing, status]);

  async function send(text: string) {
    if (!text.trim()) return;
    setSending(true);
    const r = await fetch(`/api/videos/${id}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim() }),
    });
    setSending(false);
    if (r.ok) { setMessage(""); setStatus("queued"); setPane("chat"); }
    else setNote((await r.json().catch(() => ({}))).error ?? "Could not send");
  }

  const outs = jobState?.outputs ?? [];
  const film = outs.find((o) => o.kind === "video" && /final/.test(o.path)) ?? outs.find((o) => o.kind === "video")
    ?? files.find((f) => /^out\/final\./.test(f.path)) ?? files.find((f) => VIDEO.test(f.path));
  const poster = outs.find((o) => o.kind === "poster");
  const filmSize = film ? files.find((f) => f.path === film.path)?.size : undefined;
  const fileUrl = (p: string, inline = false) => `/api/videos/${id}/download?path=${encodeURIComponent(p)}${inline ? "&inline=1" : ""}`;
  const deliverables = outs.length ? files.filter((f) => outs.some((o) => o.path === f.path)) : files.slice(0, 8);
  const screens = (jobState?.capture?.screens ?? []).filter((s) => s.file);
  const canEdit = status === "done" && video.hasJob;
  const openTab = (t: typeof tab) => { setTab(t); if (t === "edit") setEditOpened(true); setPane("video"); };
  const awaiting = status === "review" && jobState?.awaiting;

  return (
    <div className="ws" data-pane={pane}>
      <header className="ws-top">
        {/* Over the chat: what this is, and how it's doing. */}
        <div className="ws-id">
          <Link href="/videos" className="btn ghost ws-back" aria-label="All videos"><Icon name="back" /></Link>
          <div className="ws-title">
            <span className="eyebrow">{video.project ?? "Video"}</span>
            <h1 title={video.title}>{video.title}</h1>
          </div>
          <span className={`chip ${status}`}>{STATUS_LABEL[status]}</span>
          <div className="seg ws-switch" role="tablist" aria-label="Show">
            <label><input type="radio" checked={pane === "chat"} onChange={() => setPane("chat")} /><span>Chat</span></label>
            <label><input type="radio" checked={pane === "video"} onChange={() => setPane("video")} /><span>Video</span></label>
          </div>
        </div>
        {/* Over the stage: how to look at it, and what to do with it. */}
        <div className="ws-tools">
          <nav className="ws-tabs" role="tablist" aria-label="Video views">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => openTab(t.id)}>
                <Icon name={t.icon} size={15} />{t.label}
              </button>
            ))}
          </nav>
          {film && <a className="btn" href={fileUrl(film.path)} download title="Download the MP4"><Icon name="download" size={16} /><span className="btn-label">Download</span></a>}
          {/* The call to action for the Edit tab -- not shown while you're in it. */}
          {canEdit && tab !== "edit" && <button className="btn primary" onClick={() => openTab("edit")}><Icon name="edit" size={16} />Edit manually</button>}
        </div>
      </header>

      {/* --- Chat ----------------------------------------------------------- */}
      <section className="ws-chat" aria-label="Chat with the agent">
        <div className="panel-head"><span className="panel-tab"><Icon name="sparkle" size={15} />Agent</span></div>
        <div className="ws-msgs" ref={feed} aria-live="polite">
          {!video.hasJob && <div className="msg-sys">This video never reached the agent.{video.error ? ` ${video.error}` : ""}</div>}
          {items.map((it) => {
            switch (it.k) {
              case "job":
                return (
                  <div key={it.key} className="msg-job">
                    <span className="eyebrow">Your brief</span>
                    <p>{video.brief}</p>
                    <div className="facts" style={{ marginTop: ".5rem" }}>
                      <span>{timecode(video.durationS)}</span><span>{video.style}</span><span>{video.mode}</span>
                    </div>
                  </div>
                );
              case "user": return <div key={it.key} className="msg user">{it.text}</div>;
              case "agent":
                return (
                  <div key={it.key} className="msg-row">
                    <span className="avatar sm" aria-hidden="true"><span className="logo" /></span>
                    <div className="msg agent">{it.text}</div>
                  </div>
                );
              case "steps": {
                const failed = it.tools.filter((t) => tools[t.id] === false).length;
                const names = [...new Set(it.tools.map((t) => t.name))].slice(0, 4).join(", ");
                return (
                  <details key={it.key} className="msg-steps">
                    <summary>
                      <span className="spin-dot" data-done={it.tools.every((t) => t.id in tools) || undefined} />
                      Worked · {it.tools.length} step{it.tools.length > 1 ? "s" : ""}
                      <span className="muted"> · {names}</span>
                      {failed > 0 && <span className="err-count">{failed} failed</span>}
                    </summary>
                    <ol>
                      {it.tools.map((t) => (
                        <li key={t.id} className={tools[t.id] === false ? "err" : ""} title={t.input}>
                          <b>{t.name}</b> <span>{t.input}</span> <i>{t.id in tools ? (tools[t.id] ? "✓" : "✗") : "…"}</i>
                        </li>
                      ))}
                    </ol>
                  </details>
                );
              }
              case "sys": return <div key={it.key} className="msg-sys">{it.text}</div>;
              case "error": return <div key={it.key} className="msg error">{it.text}</div>;
            }
          })}
          {typing && (
            <div className="msg-row">
              <span className="avatar sm" aria-hidden="true"><span className="logo" /></span>
              <div className="msg agent">{typing}<span className="caret" /></div>
            </div>
          )}
          {working && !typing && <div className="msg-thinking"><i /><i /><i /></div>}
          {awaiting && (
            <ReviewPanel id={id} state={jobState} onShowBrief={() => openTab("brief")}
              onSent={() => { setStatus("queued"); setJobState({ ...jobState, awaiting: null }); }} />
          )}
        </div>

        {(working || status === "review") && (
          <div className="ws-status" role="status">
            <span className={working ? "rec" : "dot-wait"} aria-hidden="true" />
            <span className="ws-status-label">
              {working ? jobState?.label || (status === "queued" ? "Waiting for a free slot…" : "Working…") : "Waiting for your review"}
            </span>
            {working && jobState && <span className="tc muted">{jobState.progress}%</span>}
            {working && jobState && <span className="ws-status-bar" style={{ width: `${jobState.progress}%` }} />}
          </div>
        )}
        {video.hasJob && (
          <form className="ws-composer" onSubmit={(e) => { e.preventDefault(); void send(message); }}>
            {note && <p className="small muted" role="status" style={{ margin: "0 0 .5rem" }}>{note}</p>}
            {status === "done" && !message && (
              <div className="chips">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => { setMessage(s); composer.current?.focus(); }}>{s}</button>)}
              </div>
            )}
            <div className="composer">
              <textarea ref={composer} value={message} rows={1} disabled={sending}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(message); } }}
                placeholder={working ? "Queue a follow-up for the agent…" : "Ask for changes — “make the intro faster”…"}
                aria-label="Message the agent" />
              <button className="send" type="submit" disabled={sending || !message.trim()} aria-label="Send"><Icon name="send" size={17} /></button>
            </div>
            <p className="hint ws-hint">Enter to send · Shift+Enter for a new line</p>
          </form>
        )}
      </section>

      {/* --- Stage -------------------------------------------------------- */}
      <section className="ws-main" aria-label="The video">
        <div className="preview-card">

        <div className="ws-pane" hidden={tab !== "preview"}>
          {film ? (
            <div className="stage">
              <div className="screen stage-screen">
                <video className="preview" controls preload="metadata" src={fileUrl(film.path, true)}
                  poster={poster ? fileUrl(poster.path, true) : undefined} />
              </div>
              <div className="stage-meta">
                <span className="tc">{timecode(video.durationS)}</span>
                <span className="tc">1920×1080 · H.264{filmSize ? ` · ${size(filmSize)}` : ""}</span>
                {jobState?.capture?.method && <span className="tc">Screens · {CAPTURE_LABEL[jobState.capture.method] ?? jobState.capture.method}</span>}
              </div>
              {working && <p className="alert ok" style={{ marginTop: "1rem" }}>The agent is making changes — this is the previous cut until the new one renders.</p>}
            </div>
          ) : (
            <div className="stage building">
              <div className="building-head">
                <span className="eyebrow">{working ? "Being made" : STATUS_LABEL[status]}</span>
                <h2>{working ? (jobState?.label || "The agent is on it") : status === "review" ? "Waiting for your review" : status === "failed" ? "This one didn't finish" : "No film yet"}</h2>
                {status === "failed" && video.error && <p className="alert err">{video.error}</p>}
              </div>
              <JobProgress state={jobState} live={working} compact />
              {screens.length > 0 && (
                <>
                  <p className="eyebrow" style={{ marginTop: "1.2rem" }}>Captured screens</p>
                  <div className="thumbs">
                    {screens.map((s) => {
                      const url = fileUrl(s.file!, true);
                      return (
                        <a key={s.name} href={url} target="_blank" rel="noreferrer" title={s.route || s.name}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- private, session-gated file */}
                          <img src={url} alt={`Captured screen: ${s.name}`} loading="lazy" />
                          <span>{s.name}</span>
                        </a>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="ws-pane edit" hidden={tab !== "edit"}>
          {!canEdit ? (
            <div className="stage building"><div className="building-head">
              <span className="eyebrow">Manual edit</span>
              <h2>The timeline opens when the video is finished</h2>
              <p className="muted">Then every caption, colour, cut and sound is yours to change — or ask the agent in the chat.</p>
            </div></div>
          ) : editOpened && (
            <EditorFrame embedded videoId={id} title={video.title} token={editor.token}
              project={editor.project} savedAt={editor.savedAt} initialExports={video.exports} />
          )}
        </div>

        <div className="ws-pane" hidden={tab !== "files"}>
          <div className="pane-grid">
            <div className="card">
              <h2>Deliverables</h2>
              {files.length === 0 ? <p className="muted small">{working ? "Files appear as the agent saves them." : "No files yet."}</p> : (
                <div className="files">
                  {(allFiles ? files : deliverables).map((f) => (
                    <div key={f.path} className="file">
                      <a href={fileUrl(f.path)} title={f.path}>{f.path}</a><span className="sz">{size(f.size)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!allFiles && files.length > deliverables.length && (
                <button className="btn" style={{ marginTop: ".8rem" }} onClick={() => setAllFiles(true)}>All files ({files.length})</button>
              )}
            </div>
            <div className="card">
              <h2>Edited exports</h2>
              {video.exports.length === 0 ? <p className="muted small">Exports you make in the Edit tab land here.</p> : (
                <ul className="exports">
                  {[...video.exports].reverse().map((x) => (
                    <li key={x.id} className="file">
                      <a href={fileUrl(x.path)}>{new Date(x.created_at).toLocaleString()}</a>
                      <span className="sz">{size(x.bytes)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="ws-pane" hidden={tab !== "brief"}>
          <div className="pane-grid single">
            <div className="card">
              <h2>Brief &amp; source</h2>
              <dl className="kv">
                <dt>Brief</dt><dd style={{ whiteSpace: "pre-wrap" }}>{video.brief}</dd>
                <dt>Source</dt><dd>{video.source}</dd>
                {video.liveUrl && (<><dt>Live URL</dt><dd>{video.liveUrl}{video.hasLogin ? " · with a test login" : ""}</dd></>)}
                {video.attached.length > 0 && (<><dt>Attached</dt><dd>{video.attached.join(", ")}</dd></>)}
                <dt>Created</dt><dd>{new Date(video.createdAt).toLocaleString()}</dd>
              </dl>
            </div>
            <JobProgress state={jobState} live={working} />
          </div>
        </div>
        </div>
      </section>
    </div>
  );
}
