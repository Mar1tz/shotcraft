import type { NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { jobFor } from "@/lib/videos";

// Live job events, relayed from Agent Studio as Server-Sent Events. The browser
// never sees the Agent Studio key; closing the page closes the upstream too.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/stream">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;

  const from = Math.max(0, Number(request.nextUrl.searchParams.get("from")) || 0);
  const upstream = await agentFetch(`/jobs/${found.job}/stream?from=${from}`, { signal: request.signal });
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `Agent Studio answered ${upstream.status}` }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
