import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { NavLinks, StaticNavLinks } from "@/components/NavLinks";
import { Icon } from "@/components/Icon";
import { STATUS_LABEL, type VideoStatus } from "@/lib/types";
import { signOut } from "../login/actions";

// The studio shell: a sidebar (brand, New video, nav, recent videos, you) and
// the page in a large inset panel. On a video's workspace the sidebar folds to
// an icon rail (CSS :has) to give the chat and the film the room. Phones get a
// compact top bar instead. The static parts paint at once; the user, the
// current-page marker and the recent list stream in.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="side" aria-label="Studio">
        <Link href="/videos" className="side-brand" aria-label="ShotCraft — your videos">
          <span className="logo-tile" aria-hidden="true"><span className="logo" /></span>
          <span className="side-text"><b>ShotCraft</b><small>by Agentora</small></span>
        </Link>
        <Link href="/videos/new" className="btn primary side-new" title="New video">
          <Icon name="plus" /><span className="side-text">New video</span>
        </Link>
        <Suspense fallback={<StaticNavLinks />}><NavLinks /></Suspense>
        <div className="side-recent">
          <p className="side-label side-text">Recent</p>
          <Suspense fallback={null}><Recent /></Suspense>
        </div>
        <div className="side-foot">
          <Suspense fallback={<div className="side-user" />}><Who /></Suspense>
          <form action={signOut}>
            <button className="side-item" type="submit" title="Sign out"><Icon name="logout" /><span className="side-text">Sign out</span></button>
          </form>
        </div>
      </aside>

      <header className="topbar">
        <Link href="/videos" className="lockup" aria-label="ShotCraft — your videos"><span className="logo" aria-hidden="true" /></Link>
        <Suspense fallback={<StaticNavLinks variant="top" />}><NavLinks variant="top" /></Suspense>
        <form action={signOut}><button className="btn ghost" type="submit">Sign out</button></form>
      </header>

      <main className="app-main"><div className="page">{children}</div></main>
    </div>
  );
}

async function Who() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="side-user" title={user.email}>
      <span className="avatar-initial" aria-hidden="true">{(user.email[0] ?? "?").toUpperCase()}</span>
      <span className="side-text">{user.email}</span>
    </div>
  );
}

async function Recent() {
  const supabase = await createClient();
  const { data } = await supabase.from("videos").select("id, title, status").order("created_at", { ascending: false }).limit(5);
  const rows = (data ?? []) as { id: string; title: string; status: VideoStatus }[];
  if (rows.length === 0) return <p className="side-text muted small" style={{ margin: ".2rem .7rem" }}>Nothing yet.</p>;
  return (
    <ul>
      {rows.map((v) => (
        <li key={v.id}>
          <Link href={`/videos/${v.id}`} className="side-item" title={`${v.title} — ${STATUS_LABEL[v.status]}`}>
            <span className={`dot ${v.status}`} aria-hidden="true" />
            <span className="side-text">{v.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
