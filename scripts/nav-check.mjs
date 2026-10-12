// Client-side navigation check: visit New video, then go to Videos and Stats
// through the nav, and report whether any form from the previous page is
// still visible.  node scripts/nav-check.mjs [out-dir]
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3100";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = process.argv[2];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };
const email = `nav-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
let userId, browser;
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
  const visibleForms = () => page.$$eval("main form", (fs) => fs.filter((f) => f.offsetParent !== null).length);
  const go = async (label) => {
    await page.evaluate((l) => [...document.querySelectorAll("aside.side a")].find((a) => a.textContent.trim() === l)?.click(), label);
    await new Promise((r) => setTimeout(r, 2500));
  };
  await go("New video");
  ok((await visibleForms()) === 1, `on New video: ${await visibleForms()} visible form(s)`);
  await go("Videos");
  ok((await visibleForms()) === 0, `back on Videos: ${await visibleForms()} visible form(s) (url ${new URL(page.url()).pathname})`);
  if (out) await page.screenshot({ path: `${out}/nav-videos.png`, fullPage: true });
  if (process.env.DEBUG) console.log(await page.$$eval("main.page > *", (els) => els.map((n) =>
    `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 30)} style="${n.getAttribute("style") || ""}" display=${getComputedStyle(n).display} hidden=${n.hidden}`)));
  if (process.env.DEBUG) console.log(await page.$$eval("main form", (fs) => fs.map((f) => {
    const chain = [];
    for (let n = f; n && n.tagName !== "MAIN"; n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}.${n.className}[style="${n.getAttribute("style") || ""}"] display=${getComputedStyle(n).display}`);
    return { visible: f.offsetParent !== null, chain };
  })));
  await go("Stats");
  ok((await visibleForms()) === 0, `on Stats: ${await visibleForms()} visible form(s)`);
  if (out) await page.screenshot({ path: `${out}/nav-stats.png`, fullPage: true });
  const vid = process.env.VIDEO;
  if (vid) {
    await page.goto(`${APP}/videos/${vid}`, { waitUntil: "networkidle2" });
    await go("Videos");
    const leftovers = await page.$$eval("main.page > *", (els) => els.filter((n) => n.offsetParent !== null && n.querySelector(".film, .progress-card, .video-grid")).length);
    ok(leftovers === 0, `video page -> Videos: ${leftovers} leftover block(s)`);
    await page.goto(`${APP}/videos/${vid}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".editor-bar a", { timeout: 60000 });
    await page.evaluate(() => document.querySelector(".editor-bar a")?.click());
    await new Promise((r) => setTimeout(r, 2500));
    const shell = await page.$$eval(".editor-shell", (els) => els.filter((n) => getComputedStyle(n).display !== "none" && n.getClientRects().length).length);
    ok(shell === 0, `editor -> "← Video": editor overlay ${shell ? "STILL ON SCREEN" : "gone"} (url ${new URL(page.url()).pathname})`);
  }
} finally {
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
}
