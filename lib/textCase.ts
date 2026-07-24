/**
 * Title-case free-text fields (customer names, ship-tos, street addresses) for
 * display.
 *
 * The data comes from Fishbowl exactly as it was typed — some records ALL CAPS,
 * some mixed — which is why the portal looked randomly cased. This normalizes
 * the *display* only; the stored value is untouched, so search, sort, and
 * record-matching still run against the raw string.
 *
 * Deliberately NOT applied to state codes ("NC" must stay "NC") or channel
 * labels (a controlled vocabulary) — call it only on names and addresses.
 *
 * It is not a general English title-caser (it won't lowercase "of"/"the"): for
 * business names and street lines, capitalizing every word is the safer, more
 * predictable result.
 */

/** Tokens conventionally written all-caps — kept upper instead of title-cased. */
const KEEP_UPPER = new Set([
  "LLC", "INC", "LLP", "LP", "PLLC", "LTD", "USA", "US", "PO", "DBA",
  "NE", "NW", "SE", "SW", "II", "III", "IV", "BBQ", "HVAC",
]);

function caseWord(word: string): string {
  const upper = word.toUpperCase();
  if (KEEP_UPPER.has(upper)) return upper;

  // Mc<Capital> — "MCDONALD'S" → "McDonald's"
  if (upper.length > 2 && upper.startsWith("MC")) {
    return "Mc" + upper.charAt(2) + upper.slice(3).toLowerCase();
  }
  // O'Brien / D'Angelo — apostrophe as the second character.
  if (upper.length > 2 && upper.charAt(1) === "'") {
    return upper.charAt(0) + "'" + upper.charAt(2) + upper.slice(3).toLowerCase();
  }
  // Default: first letter up, the rest down (so "McDonald's" 's stays lower).
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

/**
 * Title-case for display. Operates on runs of letters only, so digits and
 * punctuation ("#307", "6-G", "3M", commas, hyphens) pass through unchanged.
 */
export function properCase(input: string | null | undefined): string {
  if (!input) return input ?? "";
  return input
    // Words = letter runs, allowing internal apostrophes (O'Brien, McDonald's).
    .replace(/[A-Za-z]+(?:'[A-Za-z]+)*/g, caseWord)
    // Ordinal suffixes back to lowercase: "12Th" → "12th".
    .replace(/\b(\d+)(ST|ND|RD|TH)\b/gi, (_, n, s) => n + s.toLowerCase());
}
