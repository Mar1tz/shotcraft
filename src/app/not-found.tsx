import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card" style={{ textAlign: "center", justifyItems: "center" }}>
        <div className="slate" aria-hidden="true"><span className="tc">404</span></div>
        <h1 className="brand">This one didn&apos;t make the cut</h1>
        <p className="muted" style={{ margin: 0 }}>The page or video doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link className="btn primary" href="/videos">Back to your videos</Link>
      </div>
    </main>
  );
}
