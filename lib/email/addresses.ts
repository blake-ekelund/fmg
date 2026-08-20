/**
 * Parse a raw customer email field into individual addresses.
 *
 * Customer-list import wraps multiple contacts as
 *   "primary@example.com>;<second@example.com>;<third@example.com"
 * which is the RFC-5322 mailbox-list format ("<…>; <…>") with the outer
 * brackets stripped during a prior cleanup. We also handle plain comma /
 * semicolon / newline separated addresses, in case the data sees other
 * variations.
 *
 * Returns an array of trimmed, deduped addresses. Empty for null/blank input.
 * Does NOT validate format — that's flagEmail's job. The caller can map
 * each parsed address through flagEmail to know which ones are usable.
 */
export function parseEmailAddresses(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = raw
    // The customer-list "email1>;<email2" pattern.
    .replace(/>\s*;\s*</g, ",")
    // Stray angle brackets anywhere in the string.
    .replace(/[<>]/g, "")
    // Treat semicolons + newlines as separators too.
    .replace(/\s*;\s*/g, ",")
    .replace(/\s*\n\s*/g, ",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of cleaned.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Return just the primary (first) address from a raw field, or null. */
export function primaryEmail(raw: string | null | undefined): string | null {
  const list = parseEmailAddresses(raw);
  return list[0] ?? null;
}

/** Why an address can't be relied on, when `flagEmail` finds a problem. */
export type EmailIssue = "missing" | "invalid" | "typo" | "role";

export type EmailFlag = {
  /** false = this address will not deliver. Role addresses are ok but noted. */
  ok: boolean;
  warning?: string;
  /** Machine-readable form of `warning`, for filtering lists. */
  issue?: EmailIssue;
};

/**
 * Lightweight quality check on a customer email. Returns a warning the UI
 * can render. None of these block sends — the user just sees a chip so they
 * can fix the data or exclude problematic recipients before enabling.
 *
 * Lives here rather than in the automations cron (its first caller) because
 * the same judgement is what the customer lists filter on: an address that
 * can't deliver is the same address whether an automation or a person is
 * about to mail it.
 */
export function flagEmail(email: string | null | undefined): EmailFlag {
  const e = (email ?? "").trim();
  if (!e) return { ok: false, warning: "Missing", issue: "missing" };

  // Stricter than the casual regex: at least one char before @, a domain
  // with a dot, no whitespace, no consecutive dots.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || /\.\./.test(e)) {
    return { ok: false, warning: "Invalid format", issue: "invalid" };
  }

  const lower = e.toLowerCase();
  const domain = lower.split("@")[1];
  const local = lower.split("@")[0];

  // Common domain typos — list isn't exhaustive but catches the obvious ones.
  const TYPOS: Record<string, string> = {
    "gmial.com": "gmail.com",
    "gmai.com": "gmail.com",
    "gmal.com": "gmail.com",
    "gnail.com": "gmail.com",
    "gmail.co": "gmail.com",
    "gmail.cm": "gmail.com",
    "yahooo.com": "yahoo.com",
    "yaho.com": "yahoo.com",
    "yahho.com": "yahoo.com",
    "yahoo.co": "yahoo.com",
    "hotmial.com": "hotmail.com",
    "hotmai.com": "hotmail.com",
    "hotamil.com": "hotmail.com",
    "outloook.com": "outlook.com",
    "outlok.com": "outlook.com",
    "outllook.com": "outlook.com",
    "aol.co": "aol.com",
  };
  if (TYPOS[domain]) {
    return {
      ok: false,
      warning: `Possible typo — did you mean ${TYPOS[domain]}?`,
      issue: "typo",
    };
  }

  // Role-based / shared mailboxes — deliverable, but worth surfacing for B2B.
  const ROLE_BASED = new Set([
    "info", "sales", "support", "admin", "contact", "hello",
    "noreply", "no-reply", "donotreply",
    "marketing", "office", "orders", "billing", "accounts", "service", "team", "help",
  ]);
  if (ROLE_BASED.has(local)) {
    return { ok: true, warning: "Role-based address", issue: "role" };
  }

  return { ok: true };
}

/**
 * The flag for a raw customer email FIELD, which may hold several addresses.
 * Sends go to the first parsed address, so that's the one judged.
 */
export function flagEmailField(raw: string | null | undefined): EmailFlag {
  return flagEmail(primaryEmail(raw));
}
