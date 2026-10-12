// The message that starts a video job in Agent Studio. Everything the agent
// needs is in the JSON spec; the shotcraft-job skill (bundled with Agent
// Studio) defines what it does with it, stage by stage.
import type { MusicMood, SfxLevel } from "@/lib/audio";

export interface JobSpec {
  project: string;
  title: string;
  brief: string;
  live_url: string | null;
  /** Values are NOT here: they travel as Agent Studio job `secrets` and land
   *  in the job's .secrets/login.json, which the capture script reads by key. */
  login: { url: string; secrets: ".secrets/login.json"; keys: string[] } | null;
  /** Reference screenshots / recordings, downloaded into ./uploads/. */
  assets: { file: string; kind: "image" | "video"; note?: string }[];
  mode: "auto" | "checkpoints";
  style: "auto" | "template" | "free";
  duration_s: number;
  aspect: "16:9";
  render: "final" | "draft";
  /** Voice-over voice (Deepgram Aura-2 id) or null; music mood; sound design.
   *  `avoid_tracks` = music the team's recent videos used, so each one sounds new. */
  audio: { voice: string | null; music: MusicMood; sfx: SfxLevel; avoid_tracks: string[] };
}

export function buildJobPrompt(spec: JobSpec) {
  return [
    "SHOTCRAFT JOB",
    "Use the shotcraft-job skill to make this video. The project is in ./repo.",
    "",
    "```json",
    JSON.stringify(spec, null, 2),
    "```",
  ].join("\n");
}
