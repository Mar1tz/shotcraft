// End-to-end smoke test for ShotCraft M1 against the real Supabase + Agent Studio.
// Run from the shotcraft folder with the app on :3100:  npm run build && npx next start -p 3100, then  node scripts/smoke.mjs
// Creates a temporary user + video + agent job, and removes all of them after.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const APP = "http://localhost:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `smoke-${crypto.randomBytes(4).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };
let userId, videoId, projectId, jobId;

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function keep(res) {
  for (const sc of res.headers.getSetCookie()) {
    const [pair] = sc.split(";"); const i = pair.indexOf("=");
    const k = pair.slice(0, i), v = pair.slice(i + 1);
    if (/Max-Age=0|expires=Thu, 01 Jan 1970/i.test(sc) || v === "") jar.delete(k); else jar.set(k, v);
  }
}
const get = (p, o = {}) => fetch(APP + p, { redirect: "manual", ...o, headers: { cookie: cookieHeader(), ...(o.headers || {}) } });

try {
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  userId = u.data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  ok(true, `temporary user ${email}`);

  let r = await get("/videos");
  ok(r.status === 307 && (r.headers.get("location") || "").includes("/login"), `signed out /videos -> login (${r.status})`);
  r = await get("/api/videos/00000000-0000-0000-0000-000000000000/sync", { method: "POST" });
  ok(r.status === 401, `signed out API route -> 401 (${r.status})`);

  // Sign in through the real login form (progressively enhanced server action).
  const html = await (await get("/login")).text();
  const actionField = [...html.matchAll(/name="(\$ACTION_ID_[0-9a-f]+)"/g)].map((m) => m[1])[0];
  ok(Boolean(actionField), "login form rendered with its server action");
  const fd = new FormData();
  fd.set(actionField, ""); fd.set("next", "/videos"); fd.set("email", email); fd.set("password", password);
  r = await get("/login", { method: "POST", body: fd });
  keep(r);
  ok([303, 307].includes(r.status) && [...jar.keys()].some((k) => k.startsWith("sb-")), `sign-in sets the session cookie (${r.status})`);

  r = await get("/videos");
  const page = await r.text();
  ok(r.status === 200 && page.includes(email), `/videos renders for the user (${r.status})`);

  // Create a project + video as that user (RLS applies), then the agent job --
  // the same steps the New-video action performs.
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email, password });
  const p = await sb.from("projects").insert({ name: "Smoke test project" }).select("id").single();
  projectId = p.data.id;
  const v = await sb.from("videos").insert({ project_id: projectId, title: "Smoke test", brief: "Summarise the repo in three bullets.",
    source_type: "repo", repo_url: "https://github.com/sindresorhus/slugify", status: "draft" }).select("id").single();
  videoId = v.data.id;
  ok(Boolean(videoId), "video row inserted under RLS");

  const jr = await fetch(`${process.env.AGENT_API_URL}/jobs`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.AGENT_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Write summary.md in the workspace with 3 short bullets about ./repo, then say done.",
      repo_url: "https://github.com/sindresorhus/slugify", title: "ShotCraft smoke test", metadata: { video_id: videoId } }) });
  const job = await jr.json(); jobId = job.id;
  ok(jr.status === 202 && jobId, `Agent Studio accepted the job via the app's key (${jr.status})`);
  await sb.from("videos").update({ agent_job_id: jobId, status: "queued" }).eq("id", videoId);

  // Live events through the app's SSE relay.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 240000);
  r = await get(`/api/videos/${videoId}/stream?from=0`, { signal: ctl.signal });
  ok(r.status === 200 && (r.headers.get("content-type") || "").includes("text/event-stream"), "stream relay opened");
  const seen = new Set(); let buf = "";
  try {
    for await (const chunk of r.body) {
      buf += Buffer.from(chunk).toString();
      let k; while ((k = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 2);
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6)); seen.add(ev.t);
        if (ev.t === "idle" && seen.has("result")) ctl.abort();
      }
    }
  } catch { /* aborted on purpose */ }
  clearTimeout(timer);
  ok(seen.has("tool") && seen.has("result"), `live events relayed (${[...seen].join(", ")})`);

  r = await get(`/api/videos/${videoId}/sync`, { method: "POST" });
  const s = await r.json();
  ok(r.status === 200 && s.status === "done" && s.files.some((f) => f.path === "summary.md"), `sync -> ${s.status}, files: ${s.files?.map((f) => f.path).join(", ")}`);

  r = await get(`/api/videos/${videoId}/download?path=summary.md`);
  const txt = await r.text();
  ok(r.status === 200 && txt.length > 20, `download relayed (${txt.length} bytes, ${r.headers.get("content-disposition")})`);

  r = await get(`/videos/${videoId}`);
  ok(r.status === 200 && (await r.text()).includes("Smoke test"), "video page renders");
} finally {
  if (jobId) await fetch(`${process.env.AGENT_API_URL}/jobs/${jobId}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.AGENT_API_KEY}` } });
  if (projectId) await admin.from("projects").delete().eq("id", projectId);   // cascades to the video
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log("cleanup: test job, rows and user removed");
}
