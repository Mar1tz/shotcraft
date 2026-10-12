// Sound choices for a video: the narrator's voice (Deepgram Aura-2, spoken
// through Agent Studio), the music mood (the shotcraft-job skill's Mixkit
// library) and how much sound design goes on the cuts.

export type MusicMood = "auto" | "upbeat" | "corporate" | "cinematic" | "calm" | "electronic" | "hiphop" | "none";
export type SfxLevel = "subtle" | "punchy" | "off";

/** What the user asked for (videos.audio). */
export interface AudioChoice { voice: string | null; music: MusicMood; sfx: SfxLevel }

/** What the agent made (job.json `audio`, written by the skill). */
export interface AudioRecord {
  voice?: string | null;
  music?: { id: string; title?: string; artist?: string; mood?: string; license?: string; url?: string } | null;
  sfx?: SfxLevel;
  levels?: { music?: number; voice?: number; sfx?: number };
  vo?: { shot: string; text: string; seconds?: number }[];
}

/** A voice as Agent Studio's /tts/voices lists it. */
export interface Voice { id: string; name: string; accent: string; gender: string; tags: string[] }

export const VOICE_ID = /^aura-2-[a-z]+-en$/;
export const DEFAULT_AUDIO: AudioChoice = { voice: null, music: "auto", sfx: "subtle" };

/** Shown first: the voices Deepgram tags for advertising, then a few accents. */
export const FEATURED_VOICES = [
  "aura-2-asteria-en", "aura-2-atlas-en", "aura-2-odysseus-en", "aura-2-electra-en",
  "aura-2-thalia-en", "aura-2-orpheus-en", "aura-2-draco-en", "aura-2-pandora-en",
];

export const MUSIC_MOODS: { id: MusicMood; label: string; hint: string }[] = [
  { id: "auto", label: "Agent picks", hint: "Matched to your brand" },
  { id: "upbeat", label: "Upbeat", hint: "Bright pop, disco" },
  { id: "corporate", label: "Corporate", hint: "Clean, confident" },
  { id: "cinematic", label: "Cinematic", hint: "Big drums, score" },
  { id: "electronic", label: "Electronic", hint: "Tech, bass" },
  { id: "calm", label: "Calm", hint: "Soft ambient" },
  { id: "hiphop", label: "Hip-hop", hint: "Beats, trap" },
  { id: "none", label: "No music", hint: "Voice and effects only" },
];

export const SFX_LEVELS: { id: SfxLevel; label: string; hint: string }[] = [
  { id: "subtle", label: "Subtle", hint: "A few whooshes on the big moves" },
  { id: "punchy", label: "Punchy", hint: "Every move lands with a sound" },
  { id: "off", label: "Off", hint: "Music and voice only" },
];

/** "aura-2-asteria-en" -> "Asteria" */
export const voiceName = (id: string) => {
  const n = id.split("-")[2] ?? id;
  return n.charAt(0).toUpperCase() + n.slice(1);
};

export const moodLabel = (m: string) => MUSIC_MOODS.find((x) => x.id === m)?.label ?? m;
