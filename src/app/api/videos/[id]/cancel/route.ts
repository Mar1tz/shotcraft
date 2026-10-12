import { agentJson, type AgentJob } from "@/lib/agent";
import { jobFor } from "@/lib/videos";

export async function POST(_req: Request, ctx: RouteContext<"/api/videos/[id]/cancel">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;
  try {
    const job = await agentJson<AgentJob>(`/jobs/${found.job}/cancel`, { method: "POST" });
    return Response.json({ status: job.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
