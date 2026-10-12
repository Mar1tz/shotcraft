import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Supabase client for Server Components, Server Actions and Route Handlers.
 *  Create one per request -- never share it. */
export async function createClient() {
  // Session checks read the clock (token expiry), which Partial Prefetching's
  // cookie-aware prerender of the app shell forbids -- so everything Supabase
  // touches renders at request time, inside its Suspense boundary.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, which can't set cookies. Fine:
            // proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}

/** The signed-in user's id + email, verified, or null. */
export async function currentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c ? { id: c.sub as string, email: (c.email as string) ?? "" } : null;
}
