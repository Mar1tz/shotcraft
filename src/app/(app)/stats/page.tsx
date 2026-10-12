import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CAPTURE_LABEL, STATUS_LABEL, type CaptureMethod, type JobState, type VideoStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Stats" };

const METHODS = Object.keys(CAPTURE_LABEL) as CaptureMethod[];

export default function StatsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Studio</p>
          <h1>Stats</h1>
          <p className="lede">How jobs went, and which way of capturing screens works for which kind of project.</p>
        </div>
      </div>
      <Suspense fallback={<p className="muted">Loading…</p>}><Stats /></Suspense>
    </>
  );
}

interface Row {
  status: VideoStatus;
  created_at: string;
  finished_at: string | null;
  framework: string | null;
  capture: JobState["capture"] | null;
}

const mins = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

async function Stats() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("status, created_at, finished_at, framework:state->stack->>framework, capture:state->capture")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return <p className="alert err">{error.message}</p>;
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return <div className="card empty"><p className="muted">No jobs yet.</p></div>;

  const byStatus = new Map<VideoStatus, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const finished = rows.filter((r) => r.status === "done" || r.status === "failed");
  const done = rows.filter((r) => r.status === "done" && r.finished_at);
  const durations = done.map((r) => Date.parse(r.finished_at!) - Date.parse(r.created_at)).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;

  // Framework x method: how often each rung was the one that delivered.
  const grid = new Map<string, Map<CaptureMethod, number>>();
  // Per rung: attempts, successes, and the latest reasons it didn't work.
  const rungs = new Map<CaptureMethod, { tried: number; ok: number; why: string[] }>();
  for (const r of rows) {
    const c = r.capture;
    if (!c?.method) continue;
    const fw = r.framework || "unknown";
    const cell = grid.get(fw) ?? new Map();
    cell.set(c.method, (cell.get(c.method) ?? 0) + 1);
    grid.set(fw, cell);
    const tried = c.tried?.length ? c.tried : [{ method: c.method, ok: true }];
    for (const t of tried) {
      const g = rungs.get(t.method) ?? { tried: 0, ok: 0, why: [] };
      g.tried++;
      if (t.ok) g.ok++;
      else if ("why" in t && t.why && g.why.length < 4) g.why.push(t.why);
      rungs.set(t.method, g);
    }
  }
  const frameworks = [...grid.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));

  return (
    <div className="stack">
      <section className="tiles">
        <Tile label="Videos" value={rows.length} />
        <Tile label="Finished OK" value={finished.length ? `${Math.round((byStatus.get("done") ?? 0) / finished.length * 100)}%` : "—"}
          sub={`${byStatus.get("done") ?? 0} done · ${byStatus.get("failed") ?? 0} failed`} />
        <Tile label="Median time to video" value={median === null ? "—" : mins(median)} sub="from start, including reviews" />
        <Tile label="In progress" value={(byStatus.get("queued") ?? 0) + (byStatus.get("running") ?? 0) + (byStatus.get("review") ?? 0)}
          sub={`${byStatus.get("review") ?? 0} waiting for review`} />
      </section>

      <section className="card">
        <h2 className="h3">Capture method by framework</h2>
        {frameworks.length === 0 ? <p className="muted small">No job has finished its capture stage yet.</p> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Framework</th>{METHODS.map((m) => <th key={m} title={CAPTURE_LABEL[m]}>{SHORT[m]}</th>)}</tr></thead>
              <tbody>
                {frameworks.map(([fw, cell]) => (
                  <tr key={fw}><th>{fw}</th>{METHODS.map((m) => <td key={m}>{cell.get(m) || ""}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">The best method that delivered the screens, per job. Further left is more real.</p>
      </section>

      <section className="card">
        <h2 className="h3">How each method fares</h2>
        <ul className="rungs">
          {METHODS.map((m) => {
            const g = rungs.get(m);
            const pct = g && g.tried ? Math.round((g.ok / g.tried) * 100) : 0;
            return (
              <li key={m} className="rung">
                <div className="rung-head"><b>{SHORT[m]}</b><span className="tc muted">{g ? `${g.ok}/${g.tried}` : "—"}</span></div>
                <div className="meter" role="img" aria-label={g ? `${pct}% of attempts worked` : "not tried yet"}><span style={{ width: `${pct}%` }} /></div>
                <div className="small muted">{CAPTURE_LABEL[m]}{g ? "" : " · not tried yet"}</div>
                {g?.why.length ? <ul className="small muted">{g.why.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="h3">By status</h2>
        <div className="facts">{[...byStatus.entries()].map(([s, n]) => <span key={s} className={`chip ${s}`}>{STATUS_LABEL[s]} · {n}</span>)}</div>
      </section>
    </div>
  );
}

const SHORT: Record<CaptureMethod, string> = {
  assets: "Uploads", live_url: "Live site", boot: "Booted app", harness: "Harness", recreation: "Recreated",
};

function sum(m: Map<CaptureMethod, number>) { let n = 0; for (const v of m.values()) n += v; return n; }

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card tile">
      <div className="muted small">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}
