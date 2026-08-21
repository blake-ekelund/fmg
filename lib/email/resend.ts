/**
 * Low-level Resend HTTPS sender (no SDK — same plain-fetch style as the Sassy
 * storefront). Server-only. Used for TRANSACTIONAL + automated brand mail sent
 * from our verified `RESEND_FROM_DOMAIN`, as opposed to rep 1:1 mail which still
 * goes through the sender's Outlook mailbox via lib/email/send.ts.
 *
 * Env: RESEND_API_KEY (secret). The From/Reply-To are resolved by lib/email/sender.
 */

import { rewriteEmailImageUrls } from "./imageUrls";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type ResendSendInput = {
  /** Full RFC address, e.g. `Natural Inspirations <hello@send.fragrancemarketinggroup.com>`. */
  from: string;
  to: string[];
  subject: string;
  html: string;
  cc?: string[];
  replyTo?: string;
  /** Extra Internet headers, e.g. List-Unsubscribe (Resend honours these — Graph often doesn't). */
  headers?: Record<string, string>;
};

export function resendApiConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export async function sendResendEmail(input: ResendSendInput): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not set on the server.");
  if (input.to.length === 0) throw new Error("Resend send has no recipients.");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
      subject: input.subject,
      // Images served from our own domain, not raw Supabase storage.
      html: rewriteEmailImageUrls(input.html),
      reply_to: input.replyTo || undefined,
      headers: input.headers && Object.keys(input.headers).length > 0 ? input.headers : undefined,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    throw new Error(`Resend rejected the send (${res.status}): ${json.message ?? json.name ?? "unknown error"}`);
  }
  return { id: json.id ?? "" };
}
