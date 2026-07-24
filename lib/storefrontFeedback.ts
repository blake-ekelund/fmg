/**
 * The site-feedback question set.
 *
 * Kept in one place because two codebases render it: the storefront cart asks
 * the questions, the FMG portal displays the answers. If the tag vocabulary
 * drifts between them, old rows silently render as unlabelled noise.
 *
 * The adjective list carries real negatives on purpose. A pick-list of only
 * flattering words collects only flattering words, which tells us nothing and
 * quietly turns a research tool into a compliment generator.
 */

export const PERSONALITY_TAGS = [
  "bold",
  "playful",
  "warm",
  "polished",
  "cheap-looking",
  "trying too hard",
  "generic",
  "cluttered",
] as const;

export type PersonalityTag = (typeof PERSONALITY_TAGS)[number];

/** Tags we consider criticism — the portal groups these separately. */
export const NEGATIVE_TAGS = new Set<string>([
  "cheap-looking",
  "trying too hard",
  "generic",
  "cluttered",
]);

const VALID = new Set<string>(PERSONALITY_TAGS);

/** Keep only known tags, deduped and capped. Anything else is dropped. */
export function normalizePersonalityTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = String(raw ?? "").trim().toLowerCase();
    if (VALID.has(t)) seen.add(t);
  }
  return [...seen].slice(0, PERSONALITY_TAGS.length);
}
