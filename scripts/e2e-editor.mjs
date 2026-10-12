// Browser check of the editor (M5) against a finished video -- no rendering:
// signs in as a temporary user, opens /videos/<id>/edit, waits for the
// sandboxed workbench to boot through the postMessage bridge, checks the first
// autosave reached the database, and lists failed requests. Restores the
// video's edit fields afterwards.
//   node scripts/e2e-editor.mjs <video-id>          (dev server on :3005)
//   APP=… BROWSER=path/to/chrome node scripts/e2e-editor.mjs <video-id>
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3005";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const videoId = process.argv[2];
if (!videoId) { console.error("usage: node scripts/e2e-editor.mjs <video-id>"); process.exit(2); }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };

const email = `e2e-${crypto.randomBytes(4).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const before = (await admin.from("videos").select("edit_project, edit_saved_at, exports").eq("id", videoId).single()).data;
let userId, browser;
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const failed = [], logs = [];
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(APP, "")}`); });
  page.on("requestfailed", (r) => failed.push(`ERR ${r.url().replace(APP, "")} ${r.failure()?.errorText}`));
  page.on("console", (m) => { if (["error", "warn"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });

  await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
  ok(page.url().includes("/videos"), `signed in (${new URL(page.url()).pathname})`);

  const t0 = Date.now();
  await page.goto(`${APP}/videos/${videoId}/edit`, { waitUntil: "domcontentloaded" });
  const iframe = await page.waitForSelector("iframe.editor-frame", { timeout: 180_000 });
  ok(true, `editor build ready, iframe mounted after ${Date.now() - t0} ms`);
  const frame = await iframe.contentFrame();
  // The workbench renders its app shell (topbar with the export button) once booted.
  await frame.waitForFunction(() => document.querySelectorAll("button").length > 5, { timeout: 60_000 });
  ok(true, `workbench booted in the sandbox after ${Date.now() - t0} ms`);
  const info = await frame.evaluate(() => ({
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12),
    origin: self.origin, staticBase: window.remotion_staticBase,
    cookie: (() => { try { return document.cookie; } catch (e) { return `blocked: ${e.name}`; } })(),
    parentDoc: (() => { try { return Boolean(parent.document); } catch (e) { return `blocked: ${e.name}`; } })(),
    tracks: document.querySelectorAll("[class*=track]").length,
  }));
  console.log("      ", JSON.stringify(info));
  // (self.origin is shimmed to the host for Remotion's URL building; the cookie
  // jar is what proves the document's real origin is opaque.)
  ok(String(info.cookie).startsWith("blocked"), "iframe origin is opaque (no cookie access)");
  ok(String(info.parentDoc).startsWith("blocked"), "iframe cannot reach the ShotCraft page");

  // First load imports the agent's cut and autosaves it -> database. A video
  // that already has a saved edit is resumed instead (no save on load).
  if (before?.edit_project) {
    const bar0 = await page.$eval(".editor-bar", (el) => el.innerText);
    ok(/Saved/.test(bar0), "existing edit resumed (no re-import)");
  }
  let saved = before?.edit_project ? "skip" : null;
  for (let i = 0; i < 20 && saved !== "skip" && !saved; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    saved = (await admin.from("videos").select("edit_saved_at, edit_project").eq("id", videoId).single()).data;
    if (!saved?.edit_saved_at || saved.edit_saved_at === before?.edit_saved_at) saved = null;
  }
  if (saved !== "skip") ok(Boolean(saved), `autosave reached the database${saved ? ` (${saved.edit_project.tracks.length} tracks)` : ""}`);
  const bar = await page.$eval(".editor-bar", (el) => el.innerText.replace(/\s+/g, " "));
  console.log("       bar:", bar);
  // Seek the player a few seconds in so the screenshot shows a real frame.
  const played = await frame.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^[▶►⏵]$/.test(x.textContent.trim())
      || /play/i.test(`${x.title} ${x.getAttribute("aria-label") || ""}`));
    b?.click();
    return Boolean(b);
  });
  console.log(`       play button ${played ? "clicked" : "not found"}`);
  await new Promise((r) => setTimeout(r, Number(process.env.PLAY_MS || 6000)));
  await page.screenshot({ path: process.env.SHOT || "editor-e2e.png" });

  // ERR_ABORTED = the media preloader cancelling a fetch it no longer needs.
  const editorFails = failed.filter((f) => (f.includes("/e/") || f.includes("/api/")) && !f.includes("ERR_ABORTED"));
  ok(editorFails.length === 0, `no failed editor requests${editorFails.length ? `:\n  ${editorFails.slice(0, 15).join("\n  ")}` : ""}`);
  if (logs.length) console.log("       console:\n        " + logs.slice(0, 12).join("\n        "));
} finally {
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
  // KEEP_EDIT=1 leaves the autosaved project in place (to feed a render check).
  if (before) await admin.from("videos").update(process.env.KEEP_EDIT ? { exports: before.exports } : before).eq("id", videoId);
}
