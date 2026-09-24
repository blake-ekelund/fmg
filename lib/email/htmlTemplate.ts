/**
 * Upload-time validation for HTML email templates.
 *
 * The plain-text editor can afford to be lenient about merge fields: the author
 * is looking at the hint chips as they type, and a stray {{firtName}} survives
 * to send as visible evidence of the typo. An uploaded document has neither
 * property — it was authored in Canva or Mailchimp by someone who never saw our
 * token list, and nobody reads 400 lines of table markup before hitting send.
 *
 * So this fails loudly at the one moment a human is looking: upload. Errors
 * block the save; warnings are advisory.
 *
 * Isomorphic: the upload UI runs this for instant feedback and the API route
 * runs it again as the actual gate.
 */

import { isKnownToken, suggestToken, unknownTokens } from "./mergeFields";

export type TemplateIssue = {
  severity: "error" | "warning";
  code:
    | "unknown_token"
    | "encoded_token"
    | "split_token"
    | "unclosed_token"
    | "script_tag"
    | "size";
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: TemplateIssue[];
};

/** Gmail clips messages past ~102KB, hiding everything below the fold. */
const GMAIL_CLIP_BYTES = 102 * 1024;

/** `%7B%7BfirstName%7D%7D` — braces percent-encoded by an editor's link field. */
const ENCODED_TOKEN_RE = /%7B%7B\s*([A-Za-z0-9_.-]+)\s*%7D%7D/gi;

/** `{{first<span>Name}}` — a tag boundary landing inside a token. */
const SPLIT_TOKEN_RE = /\{\{[^{}]*<[^>]*>[^{}]*\}\}/g;

/** `{{token` with no closing braces before the next tag or newline. */
const UNCLOSED_TOKEN_RE = /\{\{(?![^{}]*\}\})[^\s<]{0,40}/g;

function describeUnknown(key: string): string {
  const suggestion = suggestToken(key);
  return suggestion
    ? `Unknown merge field {{${key}}} — did you mean {{${suggestion}}}?`
    : `Unknown merge field {{${key}}}. It would be sent to the customer as literal text.`;
}

/**
 * Check a template body before it's saved.
 *
 * `format` matters: the encoded/split-token checks only make sense for markup,
 * and running them over plain text would flag false positives (a textarea can
 * legitimately contain a `<` next to braces).
 */
export function validateTemplateBody(
  body: string,
  format: "text" | "html",
): ValidationResult {
  const issues: TemplateIssue[] = [];

  for (const key of unknownTokens(body)) {
    issues.push({
      severity: "error",
      code: "unknown_token",
      message: describeUnknown(key),
    });
  }

  if (format === "html") {
    // Percent-encoded tokens: the author wrote {{firstName}} into a link field
    // and the editor URL-encoded it on export. Our regex never sees it, so it
    // ships to the customer as %7B%7BfirstName%7D%7D.
    const encoded = new Set<string>();
    for (const m of body.matchAll(ENCODED_TOKEN_RE)) encoded.add(m[1]);
    for (const key of encoded) {
      const known = isKnownToken(key);
      issues.push({
        severity: "error",
        code: "encoded_token",
        message: known
          ? `{{${key}}} is URL-encoded inside a link, so it won't be substituted. Rebuild that link with the token in plain text.`
          : `A URL-encoded merge field {{${key}}} appears inside a link, and it isn't a field we support.`,
      });
    }

    // Tokens split by a tag boundary. Renders fine in a browser, which is what
    // makes it nasty — the author's preview looks correct.
    const split = new Set<string>();
    for (const m of body.matchAll(SPLIT_TOKEN_RE)) split.add(m[0]);
    for (const raw of split) {
      issues.push({
        severity: "error",
        code: "split_token",
        message: `A merge field is broken up by HTML tags (${collapse(raw)}), so it won't be substituted. Retype it as one unbroken piece of text.`,
      });
    }

    const unclosed = new Set<string>();
    for (const m of body.matchAll(UNCLOSED_TOKEN_RE)) unclosed.add(m[0]);
    for (const raw of unclosed) {
      issues.push({
        severity: "error",
        code: "unclosed_token",
        message: `Merge field is missing its closing braces: ${collapse(raw)}`,
      });
    }

    if (/<script\b/i.test(body)) {
      issues.push({
        severity: "warning",
        code: "script_tag",
        message:
          "Contains a <script> tag. Every mail client strips scripts, so it will have no effect — but it may hurt spam scoring.",
      });
    }

    const bytes = new TextEncoder().encode(body).length;
    if (bytes > GMAIL_CLIP_BYTES) {
      issues.push({
        severity: "warning",
        code: "size",
        message: `Body is ${Math.round(bytes / 1024)}KB. Gmail clips messages over ~102KB, hiding the end behind a "View entire message" link.`,
      });
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** Squeeze markup onto one line so it's readable in an error message. */
function collapse(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}
