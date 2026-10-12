"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/videos";
}

export async function signInWithPassword(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function sendSignInLink(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") || "").trim();
  const origin = (await headers()).get("origin") || "http://localhost:3005";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Sign-ups are off: a link is only sent to someone already invited.
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(`/login?sent=1`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
