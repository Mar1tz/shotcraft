import { agentFetch } from "@/lib/agent";
import { jobFor } from "@/lib/videos";

// The editor build for this video in Agent Studio: GET = status, POST = build
// it (idempotent -- Agent Studio returns a ready build whose video hasn't
// changed; { force: true } rebuilds anyway).
async function relay(id: string, init?: RequestInit) {
  const found = await jobFor(id);
  if (found instanceof Response) return found;
  const r = await agentFetch(`/jobs/${found.job}/editor`, init);
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]/editor">) {
  return relay((await ctx.params).id);
}

export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]/editor">) {
  const body = await req.json().catch(() => ({}));
  return relay((await ctx.params).id, { method: "POST", body: JSON.stringify({ force: body?.force === true }) });
}
