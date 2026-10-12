import { createClient } from "@/lib/supabase/server";
import { getVideo } from "@/lib/videos";

const MAX_BYTES = 2 * 1024 * 1024;

// Autosave from the editor: the workbench's project JSON, as it wrote it.
export async function PUT(req: Request, ctx: RouteContext<"/api/videos/[id]/editor/project">) {
  const { id } = await ctx.params;
  const video = await getVideo(id);
  if (!video) return Response.json({ error: "No such video" }, { status: 404 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Project is too large" }, { status: 413 });
  let project: { tracks?: unknown };
  try { project = JSON.parse(text); } catch { return Response.json({ error: "Not JSON" }, { status: 400 }); }
  if (!project || !Array.isArray(project.tracks)) return Response.json({ error: "Not an editor project" }, { status: 400 });

  const saved_at = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from("videos").update({ edit_project: project, edit_saved_at: saved_at }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ saved_at });
}

// Throw the edits away: the next editor load starts from the agent's cut.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/videos/[id]/editor/project">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error } = await supabase.from("videos").update({ edit_project: null, edit_saved_at: null }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
