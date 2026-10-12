// Design review shots: every page, light + dark, desktop + phone, signed in as
// a temporary team member.  node scripts/screens.mjs <out-dir> [video-id]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3100";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const [out = "screens", videoId] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `shots-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const PAGES = (process.env.PAGES || ["/", "/login", "/videos", "/videos/new", "/stats", ...(videoId ? [`/videos/${videoId}`] : []), "/nope"].join(",")).split(",");
const MODES = (process.env.MODES || "light,dark").split(",");
const SIZES = { desktop: { width: Number(process.env.DW || 1440), height: Number(process.env.DH || 900) }, phone: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 } };

let userId, browser;
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
  for (const [size, viewport] of Object.entries(SIZES)) {
    if (process.env.SIZES && !process.env.SIZES.split(",").includes(size)) continue;
    for (const mode of MODES) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport(viewport);
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: mode }]);
      for (const p of PAGES) {
        if (p === "/" || p === "/login") {               // signed out
          await page.goto(`${APP}${p}`, { waitUntil: "networkidle2" });
        } else {
          if (!(await page.cookies()).some((c) => c.name.startsWith("sb-"))) {
            await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
            await page.type("input[name=email]", email);
            await page.type("input[name=password]", password);
            await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
          }
          await page.goto(`${APP}${p}`, { waitUntil: "networkidle2" });
        }
        await new Promise((r) => setTimeout(r, 700));
        const file = path.join(out, `${size}-${mode}-${p === "/" ? "home" : p.replace(/\//g, "_").replace(/^_/, "").slice(0, 30)}.png`);
        await page.screenshot({ path: file, fullPage: size === "phone" || process.env.FULL === "1" });
        console.log(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
}
