import "server-only";
import crypto from "node:crypto";

// The editor runs in a sandboxed iframe with an opaque origin: its requests
// carry no ShotCraft cookies, so it can't use the session (and the code in it,
// built from the agent's video project, can't read the session either). Its
// files are fetched under /e/<token>/…, where the token names one video and
// expires. Tokens are day-bucketed so asset URLs stay the same -- and stay
// cached -- for a day.

const DAY = 86_400_000;
const secret = () => crypto.createHmac("sha256", process.env.EDITOR_TOKEN_SECRET || process.env.AGENT_API_KEY || "")
  .update("shotcraft-editor-token").digest();
const sign = (body: string) => crypto.createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 32);

/** A token for this video, valid until the end of tomorrow (UTC). */
export function editorToken(videoId: string, now = Date.now()) {
  const body = `${videoId}.${Math.floor(now / DAY) + 1}`;
  return `${body}.${sign(body)}`;
}

/** The video id a token grants, or null if it's forged or expired. */
export function verifyEditorToken(token: string, now = Date.now()): string | null {
  const m = /^([0-9a-f-]{36})\.(\d+)\.([\w-]{32})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sign(`${m[1]}.${m[2]}`));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (Math.floor(now / DAY) > Number(m[2])) return null;
  return m[1];
}
