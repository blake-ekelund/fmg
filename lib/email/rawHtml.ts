/**
 * Serve a user-uploaded HTML email verbatim — the counterpart to
 * lib/email/renderBlocks.ts for the `source = 'html'` template mode.
 *
 * The block renderer builds every byte of its output from structured data, so
 * it can guarantee the markup. An uploaded file is the opposite: the user
 * hands us a finished document (usually exported from a designer or another
 * ESP) and expects it to arrive in the inbox looking exactly as designed —
 * tables, inline styles, <style> blocks, media queries and all. So we must NOT
 * run it through the strict block-text allowlist, which would strip the styling
 * that makes it a designed email.
 *
 * Instead we do a narrow, email-appropriate pass: remove the handful of things
 * that execute or that have no business in an email (script/iframe/object/…),
 * strip inline event handlers, and neutralise javascript:/vbscript: URLs.
 * Everything a real email relies on is left untouched.
 *
 * Like the block path, this runs server-side at send/preview time, not on the
 * stored value — the bytes that ship to a customer are always the ones this
 * code produced, even if the stored row were tampered with.
 *
 * Merge fields ({{firstName}} etc.) pass through untouched for later
 * substitution, and anchors are rewritten for click tracking downstream (by
 * lib/email/tracking.ts) exactly as they are for block templates.
 */

/**
 * Elements removed whole — opening tag, contents, and closing tag. These
 * either execute (script), embed foreign documents (iframe/object/embed),
 * change link resolution (base), or collect input that email can't submit
 * (form). None belong in an email; dropping them can't break a legitimate one.
 */
const STRIP_ELEMENTS = "script|iframe|object|embed|form|base";

export function sanitizeEmailHtml(input: string): string {
  let out = input ?? "";

  // Whole elements whose content must go too, not just the tag.
  out = out.replace(
    new RegExp(`<(${STRIP_ELEMENTS})\\b[\\s\\S]*?</\\1\\s*>`, "gi"),
    "",
  );
  // Their self-closing / unclosed variants (e.g. a bare <script src=…>).
  out = out.replace(new RegExp(`<(${STRIP_ELEMENTS})\\b[^>]*>`, "gi"), "");

  // Inline event handlers: onclick, onload, onerror, … in any quoting style.
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");

  // Executable URL schemes in the attributes that fetch or navigate. Left as
  // "#" so the element survives but can't run anything.
  out = out.replace(
    /(href|src|action|background|xlink:href)\s*=\s*"\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"]*"/gi,
    '$1="#"',
  );
  out = out.replace(
    /(href|src|action|background|xlink:href)\s*=\s*'\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^']*'/gi,
    "$1='#'",
  );

  return out;
}

/** A hidden preheader: the text an inbox list shows after the subject line. */
function preheaderMarkup(previewText: string): string {
  const escaped = previewText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;` +
    `max-height:0;max-width:0;opacity:0;overflow:hidden;">${escaped}</div>`
  );
}

const HAS_BODY = /<body\b[^>]*>/i;
const HAS_DOCTYPE_OR_HTML = /<(!doctype|html)\b/i;

export type RenderRawHtmlOptions = {
  /** Hidden preheader injected just inside <body>. */
  previewText?: string;
};

/**
 * Turn stored raw HTML into the finished email document.
 *
 * A full document (has <html>/<body>) is served as-is after sanitising, with
 * the preheader slipped in just inside <body>. A bare fragment is wrapped in a
 * minimal email shell so it's still a valid standalone message.
 */
export function renderRawHtmlEmail(
  rawHtml: string,
  opts: RenderRawHtmlOptions = {},
): string {
  const clean = sanitizeEmailHtml(rawHtml ?? "");
  const preheader = opts.previewText?.trim()
    ? preheaderMarkup(opts.previewText.trim())
    : "";

  // Full document: inject the preheader right after the opening <body> tag.
  if (HAS_BODY.test(clean)) {
    if (!preheader) return clean;
    return clean.replace(HAS_BODY, (m) => `${m}${preheader}`);
  }

  // Has <html> but no <body> (unusual) — don't try to be clever, serve it.
  if (HAS_DOCTYPE_OR_HTML.test(clean)) {
    return clean;
  }

  // Bare fragment: give it a standalone shell.
  return (
    `<!doctype html><html><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `</head>` +
    `<body style="margin:0;padding:0;">` +
    preheader +
    clean +
    `</body></html>`
  );
}
