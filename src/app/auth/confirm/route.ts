import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing point for emailed links (sign-in links and invitations). Handles
// both shapes Supabase can send: ?code= (PKCE) and ?token_hash=&type=.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const nextParam = searchParams.get("next") || "/videos";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/videos";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let error: string | null = "That link is missing its token.";
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  } else if (tokenHash && type) {
    error = (await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error?.message ?? null;
  }
  if (error) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  return NextResponse.redirect(`${origin}${next}`);
}
