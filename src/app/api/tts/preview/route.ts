import { agentFetch } from "@/lib/agent";
import { VOICE_ID } from "@/lib/audio";
import { requireTeam } from "@/lib/videos";

// A short sample of a voice for the wizard's play buttons. GET so the browser
// caches it; the server keeps each voice's sample too, so replaying a voice
// costs nothing (Agent Studio allows 60 new samples an hour).
const samples = new Map<string, ArrayBuffer>();

export async function GET(req: Request) {
  const denied = await requireTeam();
  if (denied) return denied;
  const voice = new URL(req.url).searchParams.get("voice") ?? "";
  if (!VOICE_ID.test(voice)) return Response.json({ error: "Unknown voice" }, { status: 400 });

  let mp3 = samples.get(voice);
  if (!mp3) {
    const r = await agentFetch("/tts/preview", { method: "POST", body: JSON.stringify({ voice }) });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      return Response.json({ error: body.error ?? `Agent Studio answered ${r.status}` }, { status: r.status === 429 ? 429 : 502 });
    }
    mp3 = await r.arrayBuffer();
    if (samples.size < 100) samples.set(voice, mp3);
  }
  return new Response(mp3, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
}
