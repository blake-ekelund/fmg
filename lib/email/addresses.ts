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
