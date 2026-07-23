import { supabaseServer } from "@/lib/supabaseServer";
import { encryptToken, decryptToken } from "@/lib/email/crypto";

/**
 * Unsubscribe plumbing: token minting for the link in outbound mail, and the
 * suppression checks that must run before anything is sent.
 *
 * Addresses are compared lowercased and trimmed everywhere — the DB has a
 * unique index on lower(email) to match.
 */

export type UnsubscribePayload = {
  email: string;
  /** Which automation the link was sent from, for traceability. */
  automationId?: string;
  customerType?: "wholesale" | "d2c";
  customerRef?: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Opaque, tamper-proof token embedded in the unsubscribe URL. */
export function mintUnsubscribeToken(payload: UnsubscribePayload): string {
  return encryptToken(JSON.stringify({ ...payload, email: normalizeEmail(payload.email) }));
}

export function readUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const parsed = JSON.parse(decryptToken(token)) as UnsubscribePayload;
    if (!parsed?.email) return null;
    return { ...parsed, email: normalizeEmail(parsed.email) };
  } catch {
    return null;
  }
}

/** Absolute unsubscribe URL for a recipient. */
export function unsubscribeUrl(origin: string, payload: UnsubscribePayload): string {
  return `${origin}/api/email/unsubscribe?t=${encodeURIComponent(mintUnsubscribeToken(payload))}`;
}

/**
 * Footer appended to automated marketing email. Required for a lawful bulk
 * send and, more practically, the only way a recipient can make it stop.
 *
 * Deliberately NOT added to one-off conversational replies — those are
 * person-to-person mail, not a list send.
 */
export function unsubscribeFooterHtml(url: string): string {
  return (
    `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e3e9ef;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b7b88;line-height:1.5">` +
    `You're receiving this because you're a Fragrance Marketing Group customer.` +
    ` <a href="${url}" style="color:#1b3c53">Unsubscribe</a>` +
    `</div>`
  );
}

/**
 * The List-Unsubscribe pair for a bulk send (RFC 2369 + RFC 8058).
 *
 * These headers are what put the "Unsubscribe" control in Gmail's and Apple
 * Mail's own UI, next to the sender name — separate from the link in the
 * footer. Gmail and Yahoo require them from bulk senders and factor them into
 * spam placement, so they matter for deliverability, not just courtesy.
 *
 * `List-Unsubscribe-Post` is the one-click half: the mailbox provider POSTs to
 * the URL itself, with no human ever loading the page, and expects the opt-out
 * to be recorded on that POST alone. Our /api/email/unsubscribe POST handler
 * does exactly that and reads the token from the query string, which is why
 * the URL must carry `?t=` rather than expecting a form body.
 *
 * Only send these on bulk/marketing mail. On a one-to-one reply they'd be
 * wrong — there is no list to leave.
 */
export function listUnsubscribeHeaders(
  origin: string,
  payload: UnsubscribePayload,
): Array<{ name: string; value: string }> {
  return [
    { name: "List-Unsubscribe", value: `<${unsubscribeUrl(origin, payload)}>` },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ];
}

/**
 * Which of these addresses have opted out. Returns a Set of lowercased emails.
 *
 * Chunked because the enrollment pass can hand in thousands of candidates and
 * PostgREST puts the IN() list in the URL.
 */
export async function findSuppressed(emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const cleaned = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (cleaned.length === 0) return out;

  const CHUNK = 200;
  for (let i = 0; i < cleaned.length; i += CHUNK) {
    const slice = cleaned.slice(i, i + CHUNK);
    const { data } = await supabaseServer
      .from("email_unsubscribes")
      .select("email")
      .in("email", slice);
    for (const r of (data ?? []) as Array<{ email: string }>) {
      out.add(normalizeEmail(r.email));
    }
  }
  return out;
}

/** True when this single address has opted out. */
export async function isSuppressed(email: string): Promise<boolean> {
  const clean = normalizeEmail(email);
  if (!clean) return false;
  const { data } = await supabaseServer
    .from("email_unsubscribes")
    .select("email")
    .eq("email", clean)
    .maybeSingle();
  return !!data;
}

/**
 * Record an opt-out and stop every automation currently mailing that address.
 * Idempotent — clicking the link twice is a no-op the second time.
 */
export async function recordUnsubscribe(
  payload: UnsubscribePayload,
  source: "link" | "manual" | "bounce" = "link",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = normalizeEmail(payload.email);
  if (!email) return { ok: false, error: "No email" };

  const { error } = await supabaseServer.from("email_unsubscribes").upsert(
    {
      email,
      customer_type: payload.customerType ?? null,
      customer_ref: payload.customerRef ?? null,
      automation_id: payload.automationId ?? null,
      source,
      reason: reason ?? null,
    },
    { onConflict: "email" },
  );
  if (error) return { ok: false, error: error.message };

  // Halt anything mid-flight for this address, or the next cron pass would
  // keep sending until each sequence happened to finish.
  await supabaseServer
    .from("automation_enrollments")
    .update({
      status: "unsubscribed",
      exit_reason: "Unsubscribed",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "enrolled")
    .ilike("customer_email", email);

  return { ok: true };
}
