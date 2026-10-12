import { agentFetch } from "@/lib/agent";
import { createClient } from "@/lib/supabase/server";
import { jobFor } from "@/lib/videos";
import type { JobState } from "@/lib/types";

// The recipe's job.json (stage, progress, brief, brand, storyboard, outputs),
// read from the job workspace and mirrored onto the videos row.
export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]/state">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;

  const r = await agentFetch(`/jobs/${found.job}/files/download?path=job.json`);
  if (r.status === 404) return Response.json({ state: null });     // the agent hasn't written it yet
  if (!r.ok) return Response.json({ error: `Agent Studio answered ${r.status}` }, { status: 502 });

  let state: JobState;
  try { state = JSON.parse(await r.text()); }
  catch { return Response.json({ state: null }); }                  // mid-write; next poll gets it

  const supabase = await createClient();
  await supabase.from("videos").update({
    stage: state.stage, progress: state.progress ?? 0, stage_label: state.label ?? null, state,
  }).eq("id", id);
  return Response.json({ state });
}
