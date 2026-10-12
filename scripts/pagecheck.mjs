// Renders every signed-in page as a temporary user and checks for content --
// no agent jobs are created. Run with the app up:
//   node scripts/pagecheck.mjs                 (dev server on :3005)
//   APP=http://localhost:3100 node scripts/pagecheck.mjs
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const APP = process.env.APP || "http://localhost:3005";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `pagecheck-${crypto.randomBytes(4).toString("hex")}@shotcraft.test`;
const password = crypto.randomBytes(12).toString("base64url");
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };

const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const keep = (res) => {
  for (const sc of res.headers.getSetCookie()) {
    const [pair] = sc.split(";"); const i = pair.indexOf("=");
    if (/Max-Age=0/i.test(sc)) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
};
const get = (p, o = {}) => fetch(APP + p, { redirect: "manual", ...o, headers: { cookie: cookie(), ...(o.headers || {}) } });

const PAGES = [
  ["/videos", ["Your videos", "New video"]],
  ["/videos/new", ["The story", "Add a test login", "Add screenshots or a screen recording", "login_password"]],
  ["/stats", ["Stats"]],
];

let userId;
try {
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw u.error;
  userId = u.data.user.id;
  await admin.from("team_members").insert({ user_id: userId });

  const html = await (await get("/login")).text();
  const action = html.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
  const fd = new FormData();
  fd.set(action, ""); fd.set("next", "/videos"); fd.set("email", email); fd.set("password", password);
  keep(await get("/login", { method: "POST", body: fd }));
  ok([...jar.keys()].some((k) => k.startsWith("sb-")), "signed in");

  for (const [path, needles] of PAGES) {
    const t0 = Date.now();
    const r = await get(path);
    const body = await r.text();
    const missing = needles.filter((n) => !body.includes(n));
    ok(r.status === 200 && missing.length === 0, `${path} ${r.status} in ${Date.now() - t0} ms${missing.length ? ` -- missing: ${missing.join(", ")}` : ""}`);
  }
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
