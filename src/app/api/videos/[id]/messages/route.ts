import { agentJson, videoStatus, type AgentJob } from "@/lib/agent";
import { createClient } from "@/lib/supabase/server";
import { jobFor } from "@/lib/videos";

// Send a follow-up instruction to the video's agent ("make it 20s", "use the
// dark theme"). The job continues the same conversation.
export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]/messages">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return Response.json({ error: "Write a message first" }, { status: 400 });
  try {
    const job = await agentJson<AgentJob>(`/jobs/${found.job}/messages`, {
      method: "POST", body: JSON.stringify({ text: text.trim().slice(0, 8000) }),
    });
    const supabase = await createClient();
    await supabase.from("videos").update({ status: videoStatus(job.status), finished_at: null }).eq("id", id);
    return Response.json({ status: job.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
