// Live row changes without the full Supabase browser client: realtime-js alone
// is a fraction of supabase-js (which also bundles auth, storage and
// postgrest). Realtime enforces Row Level Security with the user's access
// token, which @supabase/ssr keeps in a readable cookie -- refreshed by
// proxy.ts on every request, so re-reading it keeps the socket authorised.
import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** The access token from `sb-<ref>-auth-token` (maybe split into .0, .1, …;
 *  value "base64-" + base64url(JSON)). Null when signed out or unreadable. */
export function accessToken(): string | null {
  const name = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;
  const jar = new Map(document.cookie.split("; ").map((c) => {
    const i = c.indexOf("=");
    return [c.slice(0, i), c.slice(i + 1)] as const;
  }));
  let raw = jar.get(name) ?? "";
  for (let i = 0; !raw && jar.has(`${name}.0`) && jar.has(`${name}.${i}`); i++) {
    raw += jar.get(`${name}.${i}`);
    if (!jar.has(`${name}.${i + 1}`)) break;
  }
  if (!raw) return null;
  try {
    let value = decodeURIComponent(raw);
    if (value.startsWith("base64-")) {
      const b64 = value.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      value = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    }
    return (JSON.parse(value) as { access_token?: string }).access_token ?? null;
  } catch {
    return null;
  }
}

/** Calls `onChange` when a videos row (optionally one row) changes. Returns a cleanup. */
export function watchVideos(onChange: () => void, videoId?: string): () => void {
  const token = accessToken();
  if (!token) return () => {};
  const client = new RealtimeClient(`${URL_.replace(/^http/, "ws")}/realtime/v1`, { params: { apikey: ANON } });
  let channel: RealtimeChannel | null = null;
  void client.setAuth(token).then(() => {
    channel = client.channel(videoId ? `video-${videoId}` : "videos")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "videos", ...(videoId ? { filter: `id=eq.${videoId}` } : {}) },
        onChange)
      .subscribe();
  });
  // Tokens last an hour; hand the socket the refreshed one before it expires.
  const renew = setInterval(() => { const t = accessToken(); if (t) void client.setAuth(t); }, 10 * 60_000);
  return () => {
    clearInterval(renew);
    if (channel) void client.removeChannel(channel);
    client.disconnect();
  };
}
