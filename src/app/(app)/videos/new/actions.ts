"use server";

import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { agentJson, videoStatus, type AgentJob } from "@/lib/agent";
import { buildJobPrompt } from "@/lib/prompt";
import type { VideoAsset } from "@/lib/types";
import { MUSIC_MOODS, SFX_LEVELS, VOICE_ID, type AudioChoice } from "@/lib/audio";

export interface CreateVideoState { error: string | null }

const GIT_URL = /^https:\/\/[\w.-]+\/[\w./~-]+$/;
const MAX_ASSETS = 8;

/** Screenshots/recordings the form uploaded to `uploads/<uuid>/ref<n>-<name>`. */
function parseAssets(raw: string): VideoAsset[] | null {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as VideoAsset[];
    if (!Array.isArray(list) || list.length > MAX_ASSETS) return null;
    const ok = list.every((a) => typeof a.path === "string" && /^[0-9a-f-]{36}\/ref\d+-[\w.-]+$/.test(a.path)
      && (a.kind === "image" || a.kind === "video") && Number.isFinite(a.size));
    return ok ? list.map((a) => ({ path: a.path, name: a.path.split("/")[1], kind: a.kind, size: a.size })) : null;
  } catch { return null; }
}

export async function createVideo(_prev: CreateVideoState, form: FormData): Promise<CreateVideoState> {
  if (!(await currentUser())) return { error: "Your session has ended -- sign in again." };

  const project = String(form.get("project") || "").trim();
  const title = String(form.get("title") || "").trim();
  const brief = String(form.get("brief") || "").trim();
  const source = form.get("source") === "zip" ? "zip" : "repo";
  const repoUrl = String(form.get("repo_url") || "").trim();
  const zipPath = String(form.get("zip_path") || "").trim();
  let liveUrl = String(form.get("live_url") || "").trim() || null;
  const loginUrl = String(form.get("login_url") || "").trim();
  const loginUser = String(form.get("login_user") || "").trim();
  const loginPassword = String(form.get("login_password") || "");
  const assets = parseAssets(String(form.get("asset_paths") || ""));
  const assetsNote = String(form.get("assets_note") || "").trim().slice(0, 500);
  const durationS = [15, 30, 45, 60].includes(Number(form.get("duration_s"))) ? Number(form.get("duration_s")) : 30;
  const styleIn = String(form.get("style") || "auto");
  const style = (["auto", "template", "free"].includes(styleIn) ? styleIn : "auto") as "auto" | "template" | "free";
  const voiceIn = String(form.get("voice") || "");
  const musicIn = String(form.get("music") || "auto");
  const sfxIn = String(form.get("sfx") || "subtle");
  const audio: AudioChoice = {
    voice: VOICE_ID.test(voiceIn) ? voiceIn : null,
    music: MUSIC_MOODS.find((m) => m.id === musicIn)?.id ?? "auto",
    sfx: SFX_LEVELS.find((x) => x.id === sfxIn)?.id ?? "subtle",
  };
  // Review steps on unless the user unticked them.
  const mode = form.get("review") === "on" ? ("checkpoints" as const) : ("auto" as const);
  // Webhooks need a public address -- set APP_PUBLIC_URL once deployed. On
  // the laptop the video page syncs by itself instead.
  const webhookUrl = process.env.APP_PUBLIC_URL ? `${process.env.APP_PUBLIC_URL.replace(/\/+$/, "")}/api/agent-webhook` : undefined;

  if (!project) return { error: "Give the project a name." };
  if (!title) return { error: "Give the video a title." };
  if (brief.length < 10) return { error: "Describe what the video should show (a sentence or two)." };
  if (source === "repo" && !GIT_URL.test(repoUrl)) return { error: "Paste a public https:// GitHub repo URL." };
  if (source === "zip" && !zipPath) return { error: "Choose a .zip of the project." };
  if (liveUrl && !/^https?:\/\//.test(liveUrl)) return { error: "The live URL must start with http:// or https://." };
  const hasLogin = Boolean(loginUrl || loginUser || loginPassword);
  if (hasLogin) {
    if (!/^https?:\/\//.test(loginUrl)) return { error: "The login page URL must start with http:// or https://." };
    if (!loginUser || !loginPassword) return { error: "A test login needs both the email (or username) and the password." };
    liveUrl ??= new URL(loginUrl).origin;
  }
  if (!assets) return { error: "Those screenshot uploads didn't come through -- add them again." };
  if (voiceIn && !audio.voice) return { error: "Pick a narrator from the list, or switch the voice-over off." };

  const supabase = await createClient();

  // Music the team's recent videos used: the agent picks something else.
  const { data: recent } = await supabase.from("videos").select("state->audio->music->>id")
    .not("state->audio->music->>id", "is", null).order("created_at", { ascending: false }).limit(12);
  const avoidTracks = [...new Set((recent ?? []).map((r) => (r as { id?: string }).id).filter((id): id is string => Boolean(id)))];

  // Reuse a project with the same name, else create it.
  let { data: proj } = await supabase.from("projects").select("id").ilike("name", project).maybeSingle();
  if (!proj) {
    const ins = await supabase.from("projects")
      .insert({ name: project, repo_url: source === "repo" ? repoUrl : null, live_url: liveUrl })
      .select("id").single();
    if (ins.error) return { error: ins.error.message };
    proj = ins.data;
  }

  const { data: video, error } = await supabase.from("videos").insert({
    project_id: proj.id, title, brief, source_type: source,
    repo_url: source === "repo" ? repoUrl : null, zip_path: source === "zip" ? zipPath : null,
    live_url: liveUrl, status: "draft", mode, style, duration_s: durationS,
    assets, has_login: hasLogin, audio,
  }).select("id").single();
  if (error) return { error: error.message };

  // A zip reaches Agent Studio as a short-lived signed URL -- the file itself
  // never passes through this app.
  let zipUrl: string | null = null;
  if (source === "zip") {
    const signed = await supabase.storage.from("uploads").createSignedUrl(zipPath, 60 * 60);
    if (signed.error) return { error: `Could not prepare the zip: ${signed.error.message}` };
    zipUrl = signed.data.signedUrl;
  }
  // Same for screenshots: a day, since a queued job downloads them when it starts.
  let assetUrls: { url: string; name: string }[] = [];
  if (assets.length) {
    const signed = await supabase.storage.from("uploads").createSignedUrls(assets.map((a) => a.path), 60 * 60 * 24);
    const list = signed.data ?? [];
    const bad = signed.error?.message ?? list.find((d) => !d.signedUrl)?.error;
    if (bad || list.length !== assets.length) return { error: `Could not prepare the screenshots: ${bad ?? "missing files"}` };
    assetUrls = list.map((d, i) => ({ url: d.signedUrl!, name: assets[i].name }));
  }

  try {
    const job = await agentJson<AgentJob>("/jobs", {
      method: "POST",
      body: JSON.stringify({
        prompt: buildJobPrompt({
          project, title, brief, live_url: liveUrl,
          login: hasLogin ? { url: loginUrl, secrets: ".secrets/login.json", keys: ["email", "password"] } : null,
          assets: assets.map((a) => ({ file: `uploads/${a.name}`, kind: a.kind, ...(assetsNote ? { note: assetsNote } : {}) })),
          mode, style, duration_s: durationS, aspect: "16:9", render: "final",
          audio: { ...audio, avoid_tracks: avoidTracks },
        }),
        // The login goes to Agent Studio only -- never into the prompt or this database.
        ...(hasLogin ? { secrets: { email: loginUser, password: loginPassword } } : {}),
        ...(assetUrls.length ? { assets: assetUrls } : {}),
        title: `${project}: ${title}`.slice(0, 80),
        ...(source === "repo" ? { repo_url: repoUrl } : { zip_url: zipUrl }),
        metadata: { video_id: video.id, project_id: proj.id },
        ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
      }),
    });
    await supabase.from("videos").update({ agent_job_id: job.id, status: videoStatus(job.status) }).eq("id", video.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("videos").update({ status: "failed", error: msg }).eq("id", video.id);
    return { error: `Agent Studio refused the job: ${msg}` };
  }

  redirect(`/videos/${video.id}`);
}
