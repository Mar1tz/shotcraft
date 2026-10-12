import { after } from "next/server";
import { agentFetch } from "@/lib/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobFor } from "@/lib/videos";
import type { VideoExport } from "@/lib/types";

const STORAGE_LIMIT = 50 * 1024 * 1024;   // the `renders` bucket's per-file limit

// Export progress. The first time an export is seen finished it is recorded
// on the video, and (after the response) copied into Supabase Storage so it
// outlives the Agent Studio workspace.
export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]/editor/renders/[rid]">) {
  const { id, rid } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;
  const r = await agentFetch(`/jobs/${found.job}/editor/renders/${encodeURIComponent(rid)}`);
  const st = await r.json().catch(() => ({}));
  if (!r.ok) return Response.json(st, { status: r.status });

  const known = (found.video.exports ?? []).some((e) => e.id === rid);
  if (st.status === "done" && !known) {
    const entry: VideoExport = { id: rid, path: st.output, bytes: st.bytes ?? 0, created_at: st.finished_at ?? new Date().toISOString() };
    const admin = createAdminClient();
    // Only if no concurrent poll recorded it first (contains-check in the same UPDATE).
    await admin.from("videos").update({ exports: [...(found.video.exports ?? []), entry] })
      .eq("id", id).not("exports", "cs", JSON.stringify([{ id: rid }]));
    if (entry.bytes && entry.bytes <= STORAGE_LIMIT) {
      after(async () => {
        const file = await agentFetch(`/jobs/${found.job}/files/download?path=${encodeURIComponent(entry.path)}`);
        if (!file.ok) return;
        const storage_path = `${id}/${rid}.mp4`;
        const up = await admin.storage.from("renders").upload(storage_path, await file.arrayBuffer(), { contentType: "video/mp4", upsert: true });
        if (up.error) return;
        const { data } = await admin.from("videos").select("exports").eq("id", id).single();
        const list = ((data?.exports ?? []) as VideoExport[]).map((e) => (e.id === rid ? { ...e, storage_path } : e));
        await admin.from("videos").update({ exports: list }).eq("id", id);
      });
    }
  }
  return Response.json(st, { headers: { "cache-control": "no-store" } });
}
