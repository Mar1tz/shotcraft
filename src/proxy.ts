import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Runs before every page and API route: refreshes the Supabase session cookie
// and keeps signed-out visitors on the login page. The pages check again --
// this is the fast first gate, not the only one.
export async function proxy(request: NextRequest) {
  // The webhook authenticates itself (HMAC signature), not with a session --
  // skip the Supabase round trip entirely.
  if (request.nextUrl.pathname === "/api/agent-webhook") return NextResponse.next();
  // The editor's files: a sandboxed iframe sends no cookies; a signed token in
  // the path authenticates instead (lib/editor-token.ts).
  if (request.nextUrl.pathname.startsWith("/e/")) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, String(v));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;
  const isPublic = pathname === "/" || pathname === "/login" || pathname.startsWith("/auth/");

  if (!signedIn && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // The team goes straight to work; the landing page is for visitors.
  if (signedIn && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/videos";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
