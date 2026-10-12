import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sendSignInLink, signInWithPassword } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

// The card is static (sent instantly); only the part that reads the URL
// (?next, ?error, ?sent) streams in behind Suspense.
export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="auth">
      <div className="auth-card">
        <Link href="/" className="lockup" aria-label="ShotCraft home">
          <span className="logo" aria-hidden="true" />
          <b>ShotCraft</b>
          <small>by Agentora</small>
        </Link>
        <div>
          <h1 className="brand">Sign in to the studio</h1>
          <p className="muted" style={{ margin: 0 }}>Product videos from your code.</p>
        </div>
        <Suspense fallback={<Forms next="/videos" />}>
          <WithParams searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function WithParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/videos";
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <>
      {error && <p className="alert err" role="alert">{error}</p>}
      {sp.sent === "1" && <p className="alert ok" role="status">Check your email for a sign-in link.</p>}
      <Forms next={next} />
    </>
  );
}

function Forms({ next }: { next: string }) {
  return (
    <>
      <form action={signInWithPassword} className="stack">
        <input type="hidden" name="next" value={next} />
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn primary" type="submit">Sign in</button>
      </form>
      <details className="alt" style={{ marginTop: ".25rem" }}>
        <summary>Email me a sign-in link instead</summary>
        <form action={sendSignInLink} className="stack">
          <input type="hidden" name="next" value={next} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <button className="btn" type="submit">Send link</button>
        </form>
      </details>
    </>
  );
}
