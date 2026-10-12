// Row Level Security regression check (migration 0006): a signed-in account
// that is NOT on the team list must see and change nothing; a team member
// sees everything. Uses two temporary users, removed afterwards.
//   node scripts/rls-check.mjs
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) process.exitCode = 1; };

async function account(team) {
  const email = `rls-${team ? "team" : "outsider"}-${crypto.randomBytes(3).toString("hex")}@shotcraft.test`;
  const password = crypto.randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (team) await admin.from("team_members").insert({ user_id: data.user.id });
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await sb.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { id: data.user.id, sb };
}

const made = [];
try {
  const total = (await admin.from("videos").select("id", { count: "exact", head: true })).count ?? 0;
  const out = await account(false); made.push(out.id);
  const team = await account(true); made.push(team.id);

  const v = await out.sb.from("videos").select("id");
  ok(!v.error && v.data.length === 0, `outsider reads 0 of ${total} videos`);
  const p = await out.sb.from("projects").select("id");
  ok(!p.error && p.data.length === 0, "outsider reads 0 projects");
  const pr = await out.sb.from("profiles").select("id");
  ok(!pr.error && pr.data.length === 0, "outsider reads 0 profiles");
  const ins = await out.sb.from("projects").insert({ name: "rls probe" }).select("id");
  ok(Boolean(ins.error), `outsider can't create a project (${ins.error?.code || "inserted!"})`);
  const up = await out.sb.from("videos").update({ title: "pwned" }).neq("id", "00000000-0000-0000-0000-000000000000").select("id");
  ok(!up.error && up.data.length === 0, "outsider updates 0 videos");
  const ls = await out.sb.storage.from("uploads").list("", { limit: 5 });
  ok(!ls.error && ls.data.length === 0, "outsider lists 0 uploads");
  const upl = await out.sb.storage.from("uploads").upload(`rls-${Date.now()}.txt`, new Blob(["x"]));
  ok(Boolean(upl.error), "outsider can't upload");
  const tm = await out.sb.from("team_members").select("user_id");
  ok(!tm.error && tm.data.length === 0, "outsider can't read the team list");
  const self = await out.sb.from("team_members").insert({ user_id: out.id });
  ok(Boolean(self.error), "outsider can't add itself to the team");

  const tv = await team.sb.from("videos").select("id");
  ok(!tv.error && tv.data.length === total, `team member reads all ${total} videos`);
} finally {
  for (const id of made) await admin.auth.admin.deleteUser(id);
}
