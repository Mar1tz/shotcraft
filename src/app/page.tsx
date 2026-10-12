import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "ShotCraft — product videos from your code" },
  description: "Point ShotCraft at a repo, say what to show, and get a launch video built from your real product — then edit it on a timeline. By AGENTORA.",
};

// Static, no client JS: the public face of video.agentora.co.za. Signed-in
// team members never see it -- proxy.ts sends them to /videos.
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-top">
        <span className="lockup">
          <span className="logo" aria-hidden="true" />
          <b>ShotCraft</b>
          <small>by Agentora</small>
        </span>
        <Link className="btn" href="/login">Sign in</Link>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow"><span className="rec" aria-hidden="true" /> Product video studio</p>
          <h1>Your code in. <em className="grad-text">A launch video out.</em></h1>
          <p className="lede">
            Point ShotCraft at a repo or a zip, say which feature to show, and it reads the code, captures your real
            screens, writes a storyboard in your brand — and renders the film. Then trim, retime and re-word it on a
            timeline before you post.
          </p>
          <div className="hero-cta">
            <Link className="btn primary lg" href="/login">Sign in to the studio</Link>
            <span className="muted small">Invite-only while we build it.</span>
          </div>
        </section>

        <div className="reel" aria-hidden="true">
          <div className="ruler"><span>00:00</span><span>00:05</span><span>00:10</span><span>00:15</span><span>00:20</span><span>00:25</span><span>00:30</span></div>
          <div className="track"><span>Captions</span><div className="lane">
            <i className="clip" style={{ left: "14%", width: "22%" }}>Connect WhatsApp in two taps</i>
            <i className="clip" style={{ left: "52%", width: "24%" }}>Your first message, instantly</i>
            <span className="playhead" />
          </div></div>
          <div className="track"><span>Shots</span><div className="lane">
            <i className="clip ink" style={{ left: 0, width: "13%" }}>Brand open</i>
            <i className="clip ink" style={{ left: "13.5%", width: "37%" }}>Settings → Integrations</i>
            <i className="clip ink" style={{ left: "51%", width: "33%" }}>Inbox · live</i>
            <i className="clip ink" style={{ left: "84.5%", width: "15.5%" }}>Logo</i>
          </div></div>
          <div className="track"><span>Sound</span><div className="lane">
            <i className="clip" style={{ left: 0, width: "100%" }}>Music bed</i>
          </div></div>
          <div className="track"><span>Capture</span><div className="lane">
            <i className="clip tally" style={{ left: "13.5%", width: "70.5%" }}>Real screens · your live site</i>
          </div></div>
        </div>

        <section className="steps" aria-label="How it works">
          <div className="step">
            <span className="eyebrow">01 · Read</span>
            <h3>It finds the feature</h3>
            <p>Routes, components, copy and the latest changes — every claim in the brief points at the code.</p>
          </div>
          <div className="step">
            <span className="eyebrow">02 · Capture</span>
            <h3>Real screens, not mock-ups</h3>
            <p>Your live site with a test login, your own screenshots, or the app booted with sample data.</p>
          </div>
          <div className="step">
            <span className="eyebrow">03 · Review</span>
            <h3>You steer twice</h3>
            <p>Approve the feature summary and the storyboard before a single frame renders.</p>
          </div>
          <div className="step">
            <span className="eyebrow">04 · Edit</span>
            <h3>A timeline, not a black box</h3>
            <p>Every caption, colour and cut is editable in the browser. Export again in a click.</p>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <span>ShotCraft · an AGENTORA studio</span>
        <span className="tc">video.agentora.co.za</span>
      </footer>
    </div>
  );
}
