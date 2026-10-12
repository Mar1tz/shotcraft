import { agentFetch } from "@/lib/agent";
import { jobFor } from "@/lib/videos";

// Export from the editor: Agent Studio renders the project JSON to an MP4.
export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]/editor/renders">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;
  const body = await req.text();
  const r = await agentFetch(`/jobs/${found.job}/editor/renders`, { method: "POST", body });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
}
