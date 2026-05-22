import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Signed state token used as the OAuth `state` parameter.
 *
 * MS redirects to our callback without an auth cookie, so we can't trust a
 * raw user_id in the query string. Instead we HMAC-sign a small JSON blob
 * containing the user_id + nonce + expiry. The callback verifies the
 * signature before using the user_id.
 *
 * Format: base64url(json).base64url(hmacSha256(json))
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type StatePayload = {
  uid: string;          // portal user id (auth.uid())
  nonce: string;        // anti-replay
  exp: number;          // ms-since-epoch expiry
};

function getKey(): Buffer {
  // Reuse EMAIL_TOKEN_ENC_KEY — same trust boundary, one fewer secret to rotate.
  const raw = process.env.EMAIL_TOKEN_ENC_KEY;
  if (!raw) throw new Error("EMAIL_TOKEN_ENC_KEY is not set");
  return Buffer.from(raw, "base64");
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signState(userId: string): string {
  const payload: StatePayload = {
    uid: userId,
    nonce: randomBytes(8).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", getKey()).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}

export function verifyState(token: string): StatePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [jsonPart, sigPart] = parts;

  const json = fromB64url(jsonPart);
  const sig = fromB64url(sigPart);
  const expected = createHmac("sha256", getKey()).update(json).digest();
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(json.toString("utf8")) as StatePayload;
  } catch {
    return null;
  }
  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
