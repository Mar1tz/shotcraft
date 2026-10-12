// Live updates check: opens /videos signed in, changes a video's title in the
// database (as the webhook would), and waits for the page to show it without
// a reload. Restores the title afterwards.
//   node scripts/realtime-check.mjs <video-id>      (APP defaults to :3100)
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3100";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const videoId = process.argv[2];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };

const email = `rt-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const { title } = (await admin.from("videos").select("title").eq("id", videoId).single()).data;
const marker = `${title} · live ${crypto.randomBytes(2).toString("hex")}`;
let userId, browser;
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage();
  const sockets = [];
  page.on("request", (r) => { if (r.url().includes("/realtime/")) sockets.push(r.url()); });
  await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20_000 }, title);
  await new Promise((r) => setTimeout(r, 3000));          // load + idle + socket join
  const t0 = Date.now();
  await admin.from("videos").update({ title: marker }).eq("id", videoId);
  const seen = await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20_000 }, marker)
    .then(() => true).catch(() => false);
  ok(seen, `page updated itself ${seen ? `${Date.now() - t0} ms after the row changed` : "-- never (realtime not working)"}`);
  const js = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((e) => e.initiatorType === "script" || e.name.endsWith(".js")).map((e) => e.name.split("/").pop()));
  console.log(`       scripts loaded: ${js.length}`);
} finally {
  await admin.from("videos").update({ title }).eq("id", videoId);
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
}
