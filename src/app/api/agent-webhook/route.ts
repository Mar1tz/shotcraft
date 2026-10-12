import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncVideo } from "@/lib/sync";

// Agent Studio calls this when a job starts, finishes, fails or is cancelled
// (and when it pauses at a checkpoint, which ends a run). Public route: no
// session -- instead every request must carry a valid HMAC signature made
// with AGENT_WEBHOOK_SECRET, the secret paired with this app's API key.
export async function POST(req: Request) {
  const secret = process.env.AGENT_WEBHOOK_SECRET || "";
  const raw = await req.text();
  const sig = (req.headers.get("x-agent-signature") || "").replace(/^sha256=/, "");
  const want = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!secret || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) {
    return Response.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: { event?: string; job?: { id?: string; metadata?: { video_id?: string } } };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const jobId = body.job?.id;
  if (!jobId) return Response.json({ error: "No job id" }, { status: 400 });

  const admin = createAdminClient();
  // Match on the job id we stored; metadata.video_id is only a hint.
  const { data: video } = await admin.from("videos").select("id").eq("agent_job_id", jobId).maybeSingle();
  if (!video) return Response.json({ ok: true, ignored: "unknown job" });

  try {
    const patch = await syncVideo(admin, video.id, jobId);
    return Response.json({ ok: true, event: body.event, status: patch.status });
  } catch (e) {
    // 5xx makes Agent Studio retry (it tries 3 times).
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
