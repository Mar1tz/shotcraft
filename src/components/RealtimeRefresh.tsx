"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the current page when a videos row changes in the database --
// from the Agent Studio webhook, a teammate, or another tab. Supabase
// Realtime applies the same Row Level Security as normal queries.
//
// The realtime client loads after the page is up and idle, never in the
// first-load bundle (lib/realtime.ts uses realtime-js alone, not supabase-js).
export function RealtimeRefresh({ videoId }: { videoId?: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    let cleanup = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300));
    const start = () => idle(async () => {
      const { watchVideos } = await import("@/lib/realtime");
      if (stop) return;
      cleanup = watchVideos(() => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); }, videoId);
    });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => { stop = true; clearTimeout(timer); window.removeEventListener("load", start); cleanup(); };
  }, [router, videoId]);
  return null;
}
