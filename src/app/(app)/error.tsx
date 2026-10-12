"use client"; // Error boundaries must be Client Components

import Link from "next/link";

// Anything that throws while rendering an app page lands here instead of a
// blank screen. `digest` matches the server log line for the same error.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="card empty" role="alert">
      <div className="slate failed" aria-hidden="true"><span className="tc">ERR</span></div>
      <h2>Something went wrong on this page</h2>
      <p className="muted">
        Usually a dropped connection to the database or the agent. Your videos are safe.
        {error.digest ? <> <span className="tc">ref {error.digest}</span></> : null}
      </p>
      <div style={{ display: "flex", gap: ".6rem" }}>
        <button className="btn primary" onClick={() => retry()}>Try again</button>
        <Link className="btn" href="/videos">Your videos</Link>
      </div>
    </div>
  );
}
