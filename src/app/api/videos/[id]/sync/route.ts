import { createClient } from "@/lib/supabase/server";
import { syncVideo } from "@/lib/sync";
import { jobFor } from "@/lib/videos";

// Pull the job's status, result, files and job.json from Agent Studio into the
// videos row. Called by the video page when the agent stops; the webhook does
// the same without anyone watching (once the app has a public address).
export async function POST(_req: Request, ctx: RouteContext<"/api/videos/[id]/sync">) {
  const { id } = await ctx.params;
  const found = await jobFor(id);
  if (found instanceof Response) return found;
  try {
    return Response.json(await syncVideo(await createClient(), id, found.job));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
