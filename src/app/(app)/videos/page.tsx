import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type JobState, type Video } from "@/lib/types";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";

export const metadata: Metadata = { title: "Videos" };

export default function VideosPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Studio</p>
          <h1>Your videos</h1>
          <p className="lede">Everything the agent has made or is making. Open one to follow it live, review it, or edit it.</p>
        </div>
      </div>
      <RealtimeRefresh />
      <Suspense fallback={<GridSkeleton />}><VideoGrid /></Suspense>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="vgrid" aria-busy="true">
      {[0, 1, 2].map((n) => <div key={n} className="skeleton" style={{ aspectRatio: "16 / 12" }} />)}
    </div>
  );
}

type Row = Pick<Video, "id" | "title" | "status" | "created_at" | "source_type" | "duration_s" | "projects"> & { outputs: JobState["outputs"] | null };

// A stable hue per video, for the art shown until it has a poster.
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const timecode = (s: number | null) => `00:${String(s ?? 30).padStart(2, "0")}`;

async function VideoGrid() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id, title, status, created_at, source_type, duration_s, projects(name), outputs:state->outputs")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return <p className="alert err">{error.message}</p>;
  const videos = (data ?? []) as unknown as Row[];

  if (videos.length === 0) {
    return (
      <div className="card empty">
        <div className="slate" aria-hidden="true"><span className="tc">00:00</span></div>
        <h2>No videos yet</h2>
        <p className="muted">Point ShotCraft at a GitHub repo or a zipped project and describe what to show.</p>
        <Link href="/videos/new" className="btn primary">Make the first one</Link>
      </div>
    );
  }
  return (
    <div className="vgrid">
      {videos.map((v, i) => {
        const poster = v.outputs?.find((o) => o.kind === "poster")?.path;
        const live = v.status === "running" || v.status === "queued";
        return (
          <Link key={v.id} href={`/videos/${v.id}`} className="vcard">
            <div className="vcard-media">
              {poster ? (
                // Above the fold the first posters load eagerly; the rest wait until scrolled to.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/videos/${v.id}/download?path=${encodeURIComponent(poster)}&inline=1`} alt=""
                  width={640} height={360} loading={i < 3 ? "eager" : "lazy"} decoding="async" />
              ) : (
                <div className="vcard-art" style={{ "--h": hue(v.id) } as React.CSSProperties} aria-hidden="true">
                  {live ? <span className="live"><span className="rec" />RECORDING</span> : <span className="tc">{timecode(v.duration_s)}</span>}
                </div>
              )}
              <span className={`chip ${v.status}`}>{STATUS_LABEL[v.status]}</span>
              {poster && <span className="play" aria-hidden="true" />}
              {poster && <span className="dur">{timecode(v.duration_s)}</span>}
            </div>
            <div className="vcard-body">
              <div className="title">{v.title}</div>
              <div className="meta">
                {v.projects?.name ?? "—"} · {v.source_type === "repo" ? "GitHub" : "Zip"} ·{" "}
                {new Date(v.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
