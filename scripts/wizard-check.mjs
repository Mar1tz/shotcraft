// Walks the New video steps in a browser: validation stops an empty step,
// filled steps advance, Back keeps values, the last step summarises -- and
// takes a screenshot of each. Never submits (no job is created).
//   node scripts/wizard-check.mjs <out-dir>        (APP defaults to :3005)
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import puppeteer from "puppeteer-core";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3005";
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = process.argv[2] || ".";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };
const email = `wiz-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
let userId, browser;
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: Number(process.env.W || 1440), height: Number(process.env.H || 900), deviceScaleFactor: process.env.W ? 2 : 1, isMobile: Boolean(process.env.W) });
  await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
  await page.type("input[name=email]", email);
  await page.type("input[name=password]", password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click("button[type=submit]")]);
  await page.goto(`${APP}/videos/new`, { waitUntil: "networkidle2" });
  const step = () => page.$eval(".wizard-steps [aria-current=step] .lbl", (e) => e.textContent);
  const next = async () => { await page.click(".wizard-nav .btn.primary"); await new Promise((r) => setTimeout(r, 500)); };
  const shot = (n) => page.screenshot({ path: `${out}/wizard-${process.env.W ? "phone" : "desktop"}-${n}.png`, fullPage: true });

  await shot(1);
  await next();
  ok((await step()) === "The story", `empty story is not accepted (still on "${await step()}")`);
  await page.type("input[name=project]", "Agentora");
  await page.type("input[name=title]", "WhatsApp linking launch");
  await page.type("textarea[name=brief]", "Show a user connecting WhatsApp in two steps and receiving their first message in the inbox.");
  await next();
  ok((await step()) === "The code", `filled story -> "${await step()}"`);
  await shot(2);
  await page.type("input[name=repo_url]", "https://github.com/agentora/app");
  await next();
  ok((await step()) === "Real screens", `-> "${await step()}"`);
  await page.click(".wizard details.more summary");
  await shot(3);
  await next();
  ok((await step()) === "Format", `-> "${await step()}"`);
  await shot(4);
  await next();
  ok((await step()) === "Sound", `-> "${await step()}"`);
  // Voices load when the step opens (or fail, when Agent Studio has no TTS yet).
  await page.waitForFunction(() => !document.querySelector(".voice-meta .skeleton"), { timeout: 20000 }).catch(() => {});
  const cards = await page.$$eval(".voice-card", (l) => l.length);
  if (cards) {
    await page.$eval(".voice-card:nth-child(3)", (e) => e.click());
    ok((await page.$eval("input[name=voice]", (e) => e.value)) === "aura-2-odysseus-en", `picking a narrator sets the voice (${cards} featured)`);
    const sample = await page.evaluate(() => fetch("/api/tts/preview?voice=aura-2-odysseus-en").then(async (r) => [r.status, r.headers.get("content-type"), (await r.arrayBuffer()).byteLength]));
    ok(sample[0] === 200 && sample[1] === "audio/mpeg" && sample[2] > 5000, `voice sample plays (${sample.join(" ")})`);
  } else {
    console.log(`      (voices unavailable: ${await page.$eval(".sound", (e) => e.innerText.match(/aren't available[^.]*/)?.[0] ?? "?")})`);
  }
  await page.$eval(".mood input[value=electronic]", (e) => e.click());
  await page.$eval(".seg input[value=punchy]", (e) => e.click());
  await shot(5);
  await page.$eval(".sound .seg", (e) => e.scrollIntoView({ block: "end" }));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/wizard-${process.env.W ? "phone" : "desktop"}-5b.png` });
  await next();
  ok((await step()) === "Ready", `-> "${await step()}"`);
  const summary = await page.$eval(".summary", (e) => e.innerText.replace(/\s+/g, " "));
  ok(summary.includes("WhatsApp linking launch") && summary.includes("github.com/agentora/app"), `summary shows the answers`);
  ok(summary.includes("electronic music") && summary.includes("punchy effects") && (!cards || summary.includes("Narrated by Odysseus")), `summary shows the sound`);
  await shot(6);
  await page.click(".wizard-nav .btn.ghost");
  await new Promise((r) => setTimeout(r, 400));
  await page.click(".wizard-steps li:first-child button");
  await new Promise((r) => setTimeout(r, 400));
  ok((await page.$eval("input[name=title]", (e) => e.value)) === "WhatsApp linking launch", "going back keeps what was typed");
} finally {
  await browser?.close();
  if (userId) await admin.auth.admin.deleteUser(userId);
}
