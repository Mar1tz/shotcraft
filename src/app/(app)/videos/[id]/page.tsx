import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getVideo } from "@/lib/videos";
import { editorToken } from "@/lib/editor-token";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { Workspace } from "./Workspace";

export const metadata: Metadata = { title: "Video" };

export default function VideoPage(props: PageProps<"/videos/[id]">) {
  return (
    <Suspense fallback={<div className="ws ws-loading" aria-busy="true"><div className="skeleton" /><div className="skeleton" /></div>}>
      <Video params={props.params} />
    </Suspense>
  );
}

const STYLE = { template: "Ink Press", free: "Free creation", auto: "Agent's choice" } as const;

async function Video({ params }: { params: PageProps<"/videos/[id]">["params"] }) {
  const video = await getVideo((await params).id);
  if (!video) notFound();

  return (
    // A plain element around the client view: Next hides a page that stays
    // alive in the background by hiding its own elements (see videos/new).
    <div>
      <RealtimeRefresh videoId={video.id} />
      <Workspace
        video={{
          id: video.id, title: video.title, project: video.projects?.name ?? null, status: video.status,
          files: video.files ?? [], state: video.state, hasJob: Boolean(video.agent_job_id), brief: video.brief,
          source: video.source_type === "repo" ? video.repo_url ?? "" : `Zip upload (${video.zip_path?.split("/").pop()})`,
          liveUrl: video.live_url, hasLogin: video.has_login,
          attached: (video.assets ?? []).map((a) => a.name.replace(/^ref\d+-/, "")),
          createdAt: video.created_at, error: video.error, durationS: video.duration_s ?? 30,
          style: STYLE[video.style] ?? video.style, mode: video.mode === "checkpoints" ? "With reviews" : "Straight through",
          exports: video.exports ?? [],
          audio: video.audio ?? null,
        }}
        editor={{
          token: editorToken(video.id),
          project: video.edit_project ? JSON.stringify(video.edit_project) : null,
          savedAt: video.edit_saved_at,
        }}
      />
    </div>
  );
}
