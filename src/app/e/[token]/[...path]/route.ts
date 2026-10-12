import type { NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEditorToken } from "@/lib/editor-token";

// The editor's files (see lib/editor-token.ts): the built workbench and the
// media it plays, streamed from the job's workspace in Agent Studio.

const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag", "cache-control"];
const jobs = new Map<string, { job: string | null; at: number }>();   // video id -> agent job (60 s)

async function jobOf(videoId: string) {
  const hit = jobs.get(videoId);
  if (hit && Date.now() - hit.at < 60_000) return hit.job;
  const { data } = await createAdminClient().from("videos").select("agent_job_id").eq("id", videoId).maybeSingle();
  const job = (data?.agent_job_id as string | null) ?? null;
  jobs.set(videoId, { job, at: Date.now() });
  return job;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/e/[token]/[...path]">) {
  const { token, path } = await ctx.params;
  const videoId = verifyEditorToken(token);
  if (!videoId) return new Response("This editor link has expired -- reopen the editor.", { status: 403 });
  const job = await jobOf(videoId);
  if (!job) return new Response("Not found", { status: 404 });
  if (path.some((p) => p === ".." || p === "." || p.includes("\\"))) return new Response("Bad path", { status: 400 });

  const headers: HeadersInit = {};
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const upstream = await agentFetch(`/jobs/${job}/editor/static/${path.map(encodeURIComponent).join("/")}`,
                                    { headers, signal: request.signal });
  if (!upstream.ok && upstream.status !== 206) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });

  const out = new Headers();
  for (const h of PASS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  out.set("Access-Control-Allow-Origin", "*");      // the iframe's origin is opaque ("null")
  out.set("X-Content-Type-Options", "nosniff");
  out.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (path.join("/") === "index.html") {
    // Only ShotCraft pages may frame it, and only as a sandbox.
    out.set("Content-Security-Policy", "frame-ancestors 'self'; sandbox allow-scripts allow-downloads allow-modals");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
