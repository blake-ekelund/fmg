/**
 * Resolve the From / Reply-To identity for transactional + automated sends
 * through Resend, and gate whether Resend is usable at all.
 *
 * One verified domain (`RESEND_FROM_DOMAIN`, e.g. send.fragrancemarketinggroup.com)
 * carries every brand; the BRAND rides in the display name so recipients still
 * see "Natural Inspirations" / "Sassy" even though the authenticated domain is
 * FMG's. Replies route to a real monitored inbox via Reply-To.
 *
 * Env:
 *   RESEND_API_KEY       — secret (also required; see resendApiConfigured)
 *   RESEND_FROM_DOMAIN   — verified sending domain
 *   RESEND_FROM_LOCAL    — local part before @ (default "hello")
 *   RESEND_REPLY_TO      — default Reply-To when a template doesn't set one
 *                          (falls back to DEFAULT_REPLY_TO so replies never
 *                          bounce and we never look like "no-reply")
 */

import { resendApiConfigured } from "./resend";
import type { Brand } from "@/components/templates/types";

export type ResolvedSender = {
  /** Full RFC From, e.g. `Natural Inspirations <hello@send.fragrancemarketinggroup.com>`. */
  from: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
};

/** Resend can send only when BOTH the key and a verified domain are present. */
export function resendConfigured(): boolean {
  return resendApiConfigured() && !!process.env.RESEND_FROM_DOMAIN?.trim();
}

const BRAND_NAMES: Record<string, string> = {
  ni: "Natural Inspirations",
  sassy: "Sassy",
  both: "Fragrance Marketing Group",
};

/** Reply-To of last resort — a real, monitored Outlook inbox. Guarantees every
 *  send has a reply path (never "no-reply"), which recipients + spam filters
 *  both reward. Overridden by a template's reply_to or RESEND_REPLY_TO. */
const DEFAULT_REPLY_TO = "blake.ekelund@fragrancemarketinggroup.com";

/**
 * Build the sender identity. A template's own `from_name` / `reply_to` win;
 * otherwise the brand supplies the display name and env supplies the address.
 */
export function resolveSender(opts: {
  brand?: Brand | null;
  fromName?: string | null;
  replyTo?: string | null;
}): ResolvedSender {
  const domain = process.env.RESEND_FROM_DOMAIN?.trim() || "";
  const local = process.env.RESEND_FROM_LOCAL?.trim() || "hello";
  const fromEmail = domain ? `${local}@${domain}` : local;
  const fromName = opts.fromName?.trim() || BRAND_NAMES[opts.brand ?? "both"] || BRAND_NAMES.both;
  const replyTo =
    opts.replyTo?.trim() || process.env.RESEND_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
  return { from: `${fromName} <${fromEmail}>`, fromEmail, fromName, replyTo };
}
