import type { NextRequest } from "next/server";
import { agentFetch } from "@/lib/agent";
import { jobFor } from "@/lib/videos";

const PASS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

// Stream a file from the job's workspace. Forwards Range requests so the
// <video> preview can seek without downloading the whole file first.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/videos/[id]/download">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;

  const path = request.nextUrl.searchParams.get("path") || "";
  if (!path || path.includes("..")) return Response.json({ error: "Bad path" }, { status: 400 });
  const inline = request.nextUrl.searchParams.get("inline") === "1";

  const headers: HeadersInit = {};
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const upstream = await agentFetch(`/jobs/${found.job}/files/download?path=${encodeURIComponent(path)}`,
                                    { headers, signal: request.signal });
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: `Agent Studio answered ${upstream.status}` }, { status: upstream.status });
  }

  const out = new Headers();
  for (const h of PASS) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  const name = path.split("/").pop() || "file";
  out.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`);
  out.set("Cache-Control", "private, max-age=300");
  // Files are written by the agent from untrusted repos. Opened directly, an
  // SVG or HTML file could run script on this site -- the sandbox CSP stops it.
  out.set("Content-Security-Policy", "sandbox");
  out.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
