// Speed check (M7): Lighthouse, mobile profile, on the key pages -- signed in
// as a temporary team member. Prints the metrics against the plan's budgets.
//   node scripts/perf.mjs [video-id]              (production server on :3100)
//   APP=https://video.agentora.co.za node scripts/perf.mjs <video-id>
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3100";
const CHROME = process.env.CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const videoId = process.argv[2];
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUDGET = { score: 95, lcp: 1500, cls: 0.05, tbt: 150, jsKB: 120 };

const jar = new Map();
const keep = (res) => { for (const sc of res.headers.getSetCookie()) { const [pair] = sc.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i), pair.slice(i + 1)); } };
const email = `perf-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");

const pages = process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/login", "/videos", "/videos/new", "/stats", ...(videoId ? [`/videos/${videoId}`] : [])];
let userId;
const rows = [];
try {
  userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
  await admin.from("team_members").insert({ user_id: userId });
  const html = await (await fetch(`${APP}/login`)).text();
  const action = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  const fd = new FormData();
  fd.set(action, ""); fd.set("next", "/videos"); fd.set("email", email); fd.set("password", password);
  keep(await fetch(`${APP}/login`, { method: "POST", body: fd, redirect: "manual", headers: { Origin: APP } }));
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const hdr = path.join(os.tmpdir(), `lh-headers-${process.pid}.json`);
  fs.writeFileSync(hdr, JSON.stringify({ Cookie: cookie }));

  for (const p of pages) {
    const out = path.join(os.tmpdir(), `lh-${process.pid}.json`);
    const args = ["lighthouse", `${APP}${p}`, "--quiet", "--only-categories=performance", "--output=json", `--output-path=${out}`,
      "--chrome-flags=--headless=new --no-first-run", ...(p === "/login" || p === "/" ? [] : [`--extra-headers=${hdr}`]),
      // devtools = real throttled network/CPU (what a phone sees); default
      // "simulate" estimates from a fast local load and over-charges JS there.
      ...(process.env.THROTTLING ? [`--throttling-method=${process.env.THROTTLING}`] : [])];
    const r = spawnSync(process.execPath, [path.join("node_modules", "lighthouse", "cli", "index.js"), ...args.slice(1)],
      { env: { ...process.env, CHROME_PATH: CHROME }, encoding: "utf8", timeout: 240_000 });
    if (r.status !== 0 || !fs.existsSync(out)) { rows.push({ page: p, error: (r.stderr || "").split("\n").slice(-3).join(" ") }); continue; }
    const lh = JSON.parse(fs.readFileSync(out, "utf8"));
    fs.rmSync(out, { force: true });
    const a = lh.audits;
    // First-load JS = scripts requested before the load event; the rest are
    // idle-time imports and link prefetches for the next page.
    const loadAt = a.metrics?.details?.items?.[0]?.observedLoad ?? Infinity;
    const scripts = (a["network-requests"]?.details?.items || []).filter((i) => i.resourceType === "Script");
    const js = scripts.filter((i) => i.networkRequestTime <= loadAt).reduce((s, i) => s + (i.transferSize || 0), 0);
    const jsAll = scripts.reduce((s, i) => s + (i.transferSize || 0), 0);
    if (process.env.VERBOSE) {
      const fcp = a["first-contentful-paint"].numericValue;
      for (const i of (a["network-requests"]?.details?.items || []).filter((x) => x.resourceType === "Script")) {
        console.log(`   ${p} ${String(Math.round((i.transferSize || 0) / 1024)).padStart(4)}KB  t=${Math.round(i.networkRequestTime)}ms${i.networkRequestTime > fcp ? " (after FCP)" : ""}  ${i.priority}  ${i.url.replace(APP, "")}`);
      }
      for (const i of (a["bootup-time"]?.details?.items || []).slice(0, 6)) {
        console.log(`   ${p} bootup ${Math.round(i.total)}ms (script ${Math.round(i.scripting)}ms) ${String(i.url).replace(APP, "")}`);
      }
      console.log(`   ${p} dom: ${a["dom-size"]?.displayValue}; main thread:`,
        (a["mainthread-work-breakdown"]?.details?.items || []).map((i) => `${i.groupLabel} ${Math.round(i.duration)}ms`).join(", "));
      for (const i of (a["long-tasks"]?.details?.items || []).slice(0, 8)) {
        console.log(`   ${p} long task ${Math.round(i.duration)}ms at ${Math.round(i.startTime)}ms ${String(i.url).replace(APP, "")}`);
      }
      console.log(`   ${p} lcp breakdown:`, JSON.stringify(a["largest-contentful-paint-element"]?.details?.items?.[1]?.items ?? []));
    }
    rows.push({
      page: p, final: new URL(lh.finalDisplayedUrl).pathname,
      score: Math.round(lh.categories.performance.score * 100),
      fcp: Math.round(a["first-contentful-paint"].numericValue), lcp: Math.round(a["largest-contentful-paint"].numericValue),
      tbt: Math.round(a["total-blocking-time"].numericValue), cls: +a["cumulative-layout-shift"].numericValue.toFixed(3),
      ttfb: Math.round(a["server-response-time"]?.numericValue ?? 0), jsKB: Math.round(js / 1024), jsAllKB: Math.round(jsAll / 1024),
      lcpEl: a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 60) ?? "",
    });
  }
  fs.rmSync(hdr, { force: true });
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}

const mark = (v, ok) => `${v}${ok ? "" : " ✗"}`;
console.log(`throttling: ${process.env.THROTTLING || "simulate"}`);
console.log(`budgets: score ≥ ${BUDGET.score}, LCP < ${BUDGET.lcp} ms, TBT < ${BUDGET.tbt} ms (lab stand-in for INP), CLS < ${BUDGET.cls}, JS < ${BUDGET.jsKB} KB`);
for (const r of rows) {
  if (r.error) { console.log(`${r.page.padEnd(24)} ERROR ${r.error}`); continue; }
  console.log(`${r.page.padEnd(24)} score ${mark(r.score, r.score >= BUDGET.score)}  FCP ${r.fcp}  LCP ${mark(r.lcp, r.lcp < BUDGET.lcp)}  `
    + `TBT ${mark(r.tbt, r.tbt < BUDGET.tbt)}  CLS ${mark(r.cls, r.cls < BUDGET.cls)}  TTFB ${r.ttfb}  JS ${mark(`${r.jsKB}KB`, r.jsKB < BUDGET.jsKB)} (all ${r.jsAllKB}KB)`
    + `${r.final !== r.page ? `  (ended at ${r.final})` : ""}\n${"".padEnd(25)}LCP element: ${r.lcpEl}`);
}
