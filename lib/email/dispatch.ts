/**
 * One send entry point that picks the transport:
 *   - Resend (from our verified domain) when it's configured AND a brand sender
 *     was resolved — used for transactional + automated brand mail.
 *   - Otherwise the caller's Outlook mailbox via Graph (rep 1:1, or any env
 *     where Resend isn't set up).
 *
 * Returns the SAME `SendEmailResult` shape either way, so callers that record
 * threads/messages don't care which transport ran. For Resend (which has no
 * Graph conversationId) we synthesise a unique conversation id per message, so
 * each automated send is its own thread rather than collapsing together.
 */

import { sendEmail, type SendEmailInput, type SendEmailResult } from "./send";
import { sendResendEmail } from "./resend";
import { resendConfigured, type ResolvedSender } from "./sender";

export type DispatchOptions = {
  input: SendEmailInput;
  /** Brand From/Reply-To. Required to route through Resend. */
  sender?: ResolvedSender | null;
  /** Graph token for the Outlook fallback. Required if Resend can't run. */
  accessToken?: string | null;
};

/** True when this send will go through Resend rather than Outlook. */
export function willUseResend(sender?: ResolvedSender | null): boolean {
  return resendConfigured() && !!sender;
}

export async function dispatchEmail(opts: DispatchOptions): Promise<SendEmailResult> {
  const { input, sender, accessToken } = opts;

  if (willUseResend(sender)) {
    const html = input.bodyHtml ?? input.bodyText ?? "";
    const headers = input.headers
      ? Object.fromEntries(input.headers.map((h) => [h.name, h.value]))
      : undefined;
    const { id } = await sendResendEmail({
      from: sender!.from,
      replyTo: sender!.replyTo,
      to: input.to.map((r) => (r.name ? `${r.name} <${r.address}>` : r.address)),
      cc: input.cc?.map((r) => r.address),
      subject: input.subject,
      html,
      headers,
    });
    return {
      // Store the Resend id where the Graph id would go — it's just an external
      // message id for our records.
      graphMessageId: id,
      internetMessageId: null,
      // Unique per send → each automated email is its own thread.
      conversationId: `resend:${id || Math.random().toString(36).slice(2)}`,
      sentAt: new Date().toISOString(),
      bodyPreview: null,
      fromAddress: sender!.fromEmail,
      // Resend applies List-Unsubscribe headers reliably (unlike Graph).
      headersApplied: true,
    };
  }

  if (accessToken) return sendEmail(accessToken, input);
  throw new Error(
    "No email sender available — set RESEND_API_KEY + RESEND_FROM_DOMAIN, or connect an Outlook mailbox.",
  );
}
