import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getVideo } from "@/lib/videos";
import { editorToken } from "@/lib/editor-token";
import { EditorFrame } from "./EditorFrame";

export const metadata: Metadata = { title: "Editor" };

export default function EditPage(props: PageProps<"/videos/[id]/edit">) {
  return (
    <Suspense fallback={<div className="editor-shell"><div className="editor-wait"><p className="muted">Opening the editor…</p></div></div>}>
      <Edit params={props.params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<"/videos/[id]/edit">["params"] }) {
  const video = await getVideo((await params).id);
  if (!video) notFound();
  if (!video.agent_job_id || video.status !== "done") {
    return (
      <div className="card empty">
        <h2>Not ready to edit yet</h2>
        <p className="muted">The editor opens once the agent has finished the video.</p>
        <Link className="btn" href={`/videos/${video.id}`}>Back to the video</Link>
      </div>
    );
  }
  // Wrapped so that, kept alive in the background after "← Video", the
  // full-screen editor is hidden along with the page (see videos/new).
  return (
    <div>
    <EditorFrame
      videoId={video.id}
      title={video.title}
      token={editorToken(video.id)}
      project={video.edit_project ? JSON.stringify(video.edit_project) : null}
      savedAt={video.edit_saved_at}
      initialExports={video.exports ?? []}
    />
    </div>
  );
}
