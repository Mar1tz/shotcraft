import type { AudioChoice, AudioRecord } from "@/lib/audio";

export type VideoStatus = "draft" | "queued" | "running" | "review" | "done" | "failed" | "cancelled";

export interface VideoFile { path: string; size: number; mtime: number }

/** An MP4 exported from the editor (in the job workspace; copied to `renders` when it fits). */
export interface VideoExport { id: string; path: string; bytes: number; created_at: string; storage_path?: string }

/** A screenshot or screen recording the user attached (in the `uploads` bucket). */
export interface VideoAsset { path: string; name: string; kind: "image" | "video"; size: number }

export interface Video {
  id: string;
  project_id: string;
  title: string;
  brief: string;
  source_type: "repo" | "zip";
  repo_url: string | null;
  zip_path: string | null;
  live_url: string | null;
  assets: VideoAsset[];
  has_login: boolean;
  /** Sound the user asked for; null on videos made before voice-overs. */
  audio: AudioChoice | null;
  status: VideoStatus;
  agent_job_id: string | null;
  result: { ok: boolean; text: string; turns?: number; secs?: number } | null;
  files: VideoFile[];
  error: string | null;
  mode: "auto" | "checkpoints";
  style: "auto" | "template" | "free";
  duration_s: number;
  stage: JobStage | null;
  progress: number;
  stage_label: string | null;
  state: JobState | null;
  edit_project: { tracks: unknown[] } | null;
  edit_saved_at: string | null;
  exports: VideoExport[];
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  projects?: { name: string } | null;
}

// --- job.json, written by Agent Studio's shotcraft-job skill ---------------------

export type JobStage = "intake" | "understand" | "brief_review" | "capture" | "storyboard"
  | "storyboard_review" | "build" | "qa" | "render" | "done" | "failed";

export interface FeatureBrief {
  feature: string; one_liner?: string; problem?: string;
  user_flow?: { step: number; action: string; screen?: string }[];
  screens?: { name: string; route?: string; files?: string[]; key_ui_text?: string[]; states?: string[] }[];
  benefits?: string[]; confidence?: number; open_questions?: string[];
}
export interface BrandKit {
  name?: string; tagline?: string;
  logo?: { file?: string; source?: string };
  colors?: { primary?: string; accent?: string; background?: string; text?: string; palette?: string[] };
  fonts?: { heading?: string; body?: string }; ui_style?: string; tone?: string;
}
export interface Storyboard {
  route?: string; why?: string; duration_s?: number;
  shots?: { id: string; card?: string; seconds?: number; purpose?: string; on_screen_text?: string; screen?: string; vo?: string }[];
}
export interface JobState {
  stage: JobStage; progress: number; label: string; updated_at?: string;
  brief?: FeatureBrief; brand?: BrandKit; storyboard?: Storyboard;
  capture?: {
    method?: CaptureMethod;
    screens?: { name: string; file?: string; route?: string; method?: CaptureMethod }[];
    tried?: { method: CaptureMethod; ok: boolean; why?: string }[];
    notes?: string;
  };
  stack?: { framework?: string; styling?: string[]; backend?: string[] };
  audio?: AudioRecord;
  outputs?: { path: string; kind: string; bytes?: number }[];
  warnings?: string[]; awaiting?: { kind: "brief" | "storyboard"; question: string } | null; error?: string | null;
}

/** The capture ladder, best first (see the shotcraft-job skill, stage 3). */
export type CaptureMethod = "assets" | "live_url" | "boot" | "harness" | "recreation";
export const CAPTURE_LABEL: Record<CaptureMethod, string> = {
  assets: "your screenshots",
  live_url: "the live site",
  boot: "the app booted with sample data",
  harness: "the real components, rendered alone",
  recreation: "recreated from the code",
};

export const STAGES: { id: JobStage; label: string }[] = [
  { id: "intake", label: "Read project" },
  { id: "understand", label: "Find feature" },
  { id: "capture", label: "Capture screens" },
  { id: "storyboard", label: "Storyboard" },
  { id: "build", label: "Build scenes" },
  { id: "qa", label: "Check frames" },
  { id: "render", label: "Render" },
  { id: "done", label: "Done" },
];

export const STATUS_LABEL: Record<VideoStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  running: "Working",
  review: "Needs review",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};
