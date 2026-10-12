import { agentJson } from "@/lib/agent";
import type { Voice } from "@/lib/audio";
import { requireTeam } from "@/lib/videos";

// The narrator voices for the new-video wizard (Agent Studio asks Deepgram;
// the key stays there).
export async function GET() {
  const denied = await requireTeam();
  if (denied) return denied;
  try {
    const voices = await agentJson<Voice[]>("/tts/voices");
    return Response.json(voices, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
