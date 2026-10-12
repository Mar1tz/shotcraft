// Add a team member: creates the account AND puts it on the team list
// (public.team_members, migration 0006) -- the list is what grants access.
//
//   node scripts/invite.mjs someone@example.com             # emails a sign-in link
//   node scripts/invite.mjs someone@example.com --password  # creates with a password, prints it once
//
// Uses the service-role key from .env.local -- run it on your machine only.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile?.(".env.local");
const [email, flag] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/invite.mjs email@example.com [--password]");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Being signed in isn't enough -- the team list (0006) is what grants access.
async function addToTeam(userId) {
  const { error } = await admin.from("team_members").upsert({ user_id: userId });
  if (error) throw error;
}

if (flag === "--password") {
  const password = crypto.randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await addToTeam(data.user.id);
  console.log(`Created ${email}. Temporary password (shown once): ${password}`);
} else {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.APP_URL || "https://video.agentora.co.za"}/auth/confirm?next=/videos`,
  });
  if (error) throw error;
  await addToTeam(data.user.id);
  console.log(`Invitation emailed to ${email}.`);
}
