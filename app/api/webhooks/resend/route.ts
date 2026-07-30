import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { recordUnsubscribe } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

/**
 * POST /api/webhooks/resend
 *
 * Resend delivery events → the suppression list. Permanent bounces and spam
 * complaints are recorded in email_unsubscribes (which every send path
 * already consults), so a dead or hostile address is mailed at most once.
 * Transient bounces (mailbox full, greylisting) are deliberately ignored —
 * those addresses may deliver fine tomorrow.
 *
 * This endpoint is PUBLIC (Resend can't send our auth header); the Svix
 * signature is the authentication. Set RESEND_WEBHOOK_SECRET (whsec_…) from
 * the webhook's page in the Resend dashboard.
 */

/** Accept events no older than this — replay protection. */
const TOLERANCE_SECONDS = 5 * 60;

type ResendEvent = {
  type?: string;
  data?: {
    to?: string[];
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
};

/**
 * Verify the Svix signature Resend signs deliveries with.
 * Scheme: base64(HMAC-SHA256(base64decode(secret), `${id}.${timestamp}.${body}`)),
 * compared against each space-delimited `v1,<sig>` entry in svix-signature.
 */
function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  for (const part of signatureHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const candidate = Buffer.from(sig, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    // Misconfiguration, not a bad request — surface loudly in Resend's
    // delivery log so it gets noticed.
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not set" }, { status: 500 });
  }

  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  const body = await request.text();

  if (!id || !timestamp || !signature || !verifySignature(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recipients = (event.data?.to ?? []).filter(
    (a): a is string => typeof a === "string" && a.includes("@"),
  );

  if (event.type === "email.bounced") {
    const bounce = event.data?.bounce;
    // Only hard failures suppress. Resend classifies: Permanent (dead),
    // Transient (retryable), Undetermined (unknown — don't punish it).
    if (bounce?.type?.toLowerCase() !== "permanent") {
      return NextResponse.json({ ok: true, ignored: "non-permanent bounce" });
    }
    const reason = [bounce.subType, bounce.message].filter(Boolean).join(": ").slice(0, 400)
      || "Permanent bounce";
    for (const address of recipients) {
      await recordUnsubscribe({ email: address }, "bounce", reason);
    }
    return NextResponse.json({ ok: true, suppressed: recipients.length });
  }

  if (event.type === "email.complained") {
    for (const address of recipients) {
      await recordUnsubscribe({ email: address }, "complaint", "Marked email as spam");
    }
    return NextResponse.json({ ok: true, suppressed: recipients.length });
  }

  // Subscribed to an event we don't act on — acknowledge so Resend doesn't retry.
  return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
}
