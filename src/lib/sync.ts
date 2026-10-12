import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { agentFetch, agentJson, type AgentFile, type AgentJob } from "@/lib/agent";
import type { JobState, VideoStatus } from "@/lib/types";

/** Read the recipe's job.json; null if the agent hasn't written it yet. */
export async function readJobState(job: string): Promise<JobState | null> {
  const r = await agentFetch(`/jobs/${job}/files/download?path=job.json`);
  if (!r.ok) return null;
  try { return JSON.parse(await r.text()) as JobState; } catch { return null; }
}

/** Agent Studio's job status + the recipe's state -> the video's status.
 *  A job that stopped at a checkpoint is idle but not finished: "review". */
export function statusFrom(job: AgentJob, state: JobState | null): VideoStatus {
  if (job.status === "queued" || job.status === "running") return job.status;
  // The recipe reaching "done" is authoritative: a user who stops the agent
  // during its last self-checks still has a finished video.
  if (state?.stage === "done") return "done";
  if (job.status === "failed" || job.status === "cancelled") return job.status;
  if (state?.awaiting) return "review";
  if (state?.stage === "failed") return "failed";
  return "done";
}

/** Pull status, result, files and job.json from Agent Studio onto the row.
 *  Used by the video page (user's client) and the webhook (admin client). */
export async function syncVideo(supabase: SupabaseClient, videoId: string, job: string) {
  const [agentJob, files, state] = await Promise.all([
    agentJson<AgentJob>(`/jobs/${job}`),
    agentJson<AgentFile[]>(`/jobs/${job}/files`),
    readJobState(job),
  ]);
  const status = statusFrom(agentJob, state);
  const terminal = status === "done" || status === "failed" || status === "cancelled";
  const patch = {
    status, result: agentJob.result, files,
    error: status === "failed" ? (state?.error || agentJob.result?.text || "").slice(0, 2000) || null : null,
    finished_at: terminal ? new Date().toISOString() : null,
    ...(state ? { state, stage: state.stage, progress: state.progress ?? 0, stage_label: state.label ?? null } : {}),
  };
  const { error } = await supabase.from("videos").update(patch).eq("id", videoId);
  if (error) throw new Error(error.message);
  // Have the editor ready before anyone asks (a no-op when it already is).
  if (status === "done") void agentFetch(`/jobs/${job}/editor`, { method: "POST", body: "{}" }).catch(() => {});
  return patch;
}
