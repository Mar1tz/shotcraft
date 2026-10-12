import "server-only";

// Client for Agent Studio's API (agent.tmaritz.xyz/api/v1). Server-side only:
// the key in AGENT_API_KEY must never reach the browser.

const BASE = (process.env.AGENT_API_URL || "").replace(/\/+$/, "");
const KEY = process.env.AGENT_API_KEY || "";

export type AgentJobStatus = "idle" | "queued" | "running" | "done" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  title: string;
  status: AgentJobStatus;
  model: string;
  queued_position: number | null;
  events: number;
  result: { ok: boolean; text: string; turns?: number; secs?: number } | null;
}

export interface AgentFile { path: string; size: number; mtime: number }

/** Raw fetch to Agent Studio with the API key. Never cached. */
export function agentFetch(path: string, init: RequestInit = {}) {
  if (!BASE || !KEY) throw new Error("AGENT_API_URL / AGENT_API_KEY are not set in .env.local");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${KEY}`);
  // On the server, ShotCraft calls Agent Studio container-to-container
  // (http://agent-studio:3000), skipping Traefik -- so it brings the gate
  // header Traefik would otherwise add.
  if (process.env.AGENT_GATE_SECRET) headers.set("X-Agent-Gate", process.env.AGENT_GATE_SECRET);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  return fetch(`${BASE}${path}`, { ...init, headers, cache: "no-store" });
}

export async function agentJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await agentFetch(path, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `Agent Studio answered ${r.status}`);
  return body as T;
}

/** Map an Agent Studio job status onto the videos.status column. */
export function videoStatus(s: AgentJobStatus): "queued" | "running" | "done" | "failed" | "cancelled" {
  return s === "idle" ? "done" : s;
}
