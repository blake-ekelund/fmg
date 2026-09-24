/**
 * Per-recipient discount codes in email: `{{discountCode:BATCH}}`.
 *
 * A template drops the token wherever the code should appear (usually a
 * promotion block's code field). At send time each recipient gets their own
 * single-use code minted under the named unique-code batch — so a 20%-off
 * win-back can't be forwarded to a coupon site and reused.
 *
 * Kept apart from the ordinary merge fields because it is async (it writes a
 * row) and parameterised by batch; applyMergeFields leaves it untouched, so the
 * order of the two passes doesn't matter.
 *
 * Previews and test sends substitute an obvious sample (`COMEBACK15-SAMPLE`)
 * instead of minting — a test should never burn real codes.
 */

import { isMintFailure, mintUniqueCode } from "@/lib/storefrontDiscountCodes";

const TOKEN_RE = /\{\{\s*discountCode\s*:\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** Distinct batch codes referenced by the template, uppercased. */
export function discountBatchesIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(TOKEN_RE)) out.add(m[1].toUpperCase());
  return [...out];
}

export function hasDiscountTokens(html: string): boolean {
  return discountBatchesIn(html).length > 0;
}

/** Preview/test pass: every token becomes `<BATCH>-SAMPLE`. */
export function applyDiscountSample(html: string): string {
  return html.replace(TOKEN_RE, (_m, batch: string) => `${batch.toUpperCase()}-SAMPLE`);
}

export class DiscountMintError extends Error {}

/**
 * Real-send pass: mint one code per distinct batch in the template and
 * substitute it everywhere that batch's token appears (so a code repeated in
 * the body and a button stays the same code).
 *
 * Throws DiscountMintError if any batch can't mint (missing, paused, out of
 * window). Callers must NOT send in that case — an email promising a code that
 * doesn't work is worse than a delayed email.
 */
export async function mintDiscountTokens(html: string): Promise<string> {
  const batches = discountBatchesIn(html);
  if (batches.length === 0) return html;

  const codes = new Map<string, string>();
  for (const batch of batches) {
    const minted = await mintUniqueCode(batch);
    if (isMintFailure(minted)) {
      throw new DiscountMintError(`Discount code "${batch}": ${minted.error}`);
    }
    codes.set(batch, minted.code);
  }
  return html.replace(TOKEN_RE, (_m, batch: string) => codes.get(batch.toUpperCase()) ?? _m);
}
