import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Video } from "@/lib/types";

/** Load a video the signed-in user may see (RLS decides), or null. */
export async function getVideo(id: string): Promise<Video | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("*, projects(name)").eq("id", id).maybeSingle();
  return (data as Video | null) ?? null;
}

/** For route handlers: the video's Agent Studio job id, or a ready error Response. */
export async function jobFor(id: string): Promise<{ video: Video; job: string } | Response> {
  const video = await getVideo(id);
  if (!video) return Response.json({ error: "No such video" }, { status: 404 });
  if (!video.agent_job_id) return Response.json({ error: "This video has no agent job" }, { status: 409 });
  return { video, job: video.agent_job_id };
}
