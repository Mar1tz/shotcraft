// Video workspace check: chat + preview render, the Edit tab boots the
// embedded timeline editor, Brief/Files tabs switch, and on a phone the
// Chat/Video switch shows one side at a time. Screenshots each state.
//   node scripts/workspace-check.mjs <video-id> <out-dir>      (APP defaults to :3005)
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3005";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const [videoId, out = "."] = process.argv.slice(2);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };
const email = `ws-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const before = (await admin.from("videos").select("edit_project, edit_saved_at").eq("id", videoId).single()).data;
let userId, browser;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
  await page.goto(`${APP}/videos/${videoId}`, { waitUntil: "networkidle2" });
  await wait(1500);
  const chat = await page.$$eval(".ws-msgs > *", (els) => els.length);
  ok(chat > 0, `chat shows the conversation (${chat} items)`);
  ok(Boolean(await page.$(".ws-pane:not([hidden]) video.preview")), "preview tab shows the film");
  await wait(1500);
  const atEnd = await page.$eval(".ws-msgs", (e) => e.scrollHeight - e.scrollTop - e.clientHeight < 60);
  ok(atEnd, "chat opens at the latest message");
  const fits = await page.$eval(".ws-pane:not([hidden])", (e) => e.scrollHeight <= e.clientHeight + 2);
  ok(fits, "the whole preview fits without scrolling (1440x900)");
  await page.screenshot({ path: `${out}/ws-preview.png` });

  const tab = async (name) => {
    await page.evaluate((n) => [...document.querySelectorAll(".ws-tabs button")].find((b) => b.textContent === n)?.click(), name);
    await wait(600);
  };
  await tab("Edit");
  const frame = await page.waitForSelector(".ws-pane.edit iframe.editor-frame", { timeout: 120000 }).catch(() => null);
  ok(Boolean(frame), "Edit tab embeds the timeline editor");
  if (frame) {
    const f = await frame.contentFrame();
    const booted = await f.waitForFunction(() => document.querySelectorAll("button").length > 5, { timeout: 60000 }).then(() => true).catch(() => false);
    ok(booted, "the editor booted inside the workspace");
    await wait(1500);
    await page.screenshot({ path: `${out}/ws-edit.png` });
  }
  await tab("Brief");
  ok(await page.$eval(".ws-pane:not([hidden])", (e) => e.innerText.includes("Brief & source")), "Brief tab shows the brief");
  await page.screenshot({ path: `${out}/ws-brief.png` });
  await tab("Files");
  ok(await page.$eval(".ws-pane:not([hidden])", (e) => e.innerText.includes("Deliverables")), "Files tab shows the deliverables");

  await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await page.goto(`${APP}/videos/${videoId}`, { waitUntil: "networkidle2" });
  await wait(1200);
  const vis = (sel) => page.$eval(sel, (e) => getComputedStyle(e).display !== "none");
  ok((await vis(".ws-main")) && !(await vis(".ws-chat")), "phone: Video side shown first");
  await page.screenshot({ path: `${out}/ws-phone-video.png` });
  await page.evaluate(() => [...document.querySelectorAll(".ws-switch span")].find((s) => s.textContent === "Chat")?.click());
  await wait(500);
  ok((await vis(".ws-chat")) && !(await vis(".ws-main")), "phone: Chat switch shows the chat");
  await page.screenshot({ path: `${out}/ws-phone-chat.png` });
} finally {
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
  if (before) await admin.from("videos").update(before).eq("id", videoId);
}
