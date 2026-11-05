/**
 * Rich text for product copy (short/long description, benefits, ingredients,
 * how to use, retailer notes). Stored as a tiny HTML subset in the same text
 * columns: <p> <br> <strong> <em> <ul> <ol> <li> — nothing else, never any
 * attributes. Older rows are plain text and keep working everywhere.
 *
 * KEEP IN SYNC with the copies in store/sassy and store/ni
 * (src/lib/fmg/richText.ts) — the storefronts render what FMG saves.
 */

const ALLOWED = ["p", "br", "strong", "em", "ul", "ol", "li"] as const;

/** Does this text carry our HTML (vs. legacy plain text)? */
export function isRichText(s: string | null | undefined): boolean {
  return !!s && /<\/?(p|br|strong|em|b|i|ul|ol|li|div)\b/i.test(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape markup that is already HTML: tags become text, but entities that
 * are already there (&amp; &#39; …) stay as they are. Escaping them again is
 * what turned "don't" into "don&#39;t", then "don&amp;#39;t", one layer per
 * save. Quotes need no escaping — no attributes survive.
 */
function escapeMarkup(s: string): string {
  return s
    .replace(/&(?!(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Allowlist sanitizer: escape EVERYTHING, then re-enable only bare allowed
 * tags. Attributes, scripts, styles, links — anything else — stay escaped
 * text, so the result is safe for dangerouslySetInnerHTML. Browser-editor
 * output is normalized first (<b>/<i> → <strong>/<em>, <div> → <p>).
 * Idempotent: sanitizing its own output changes nothing. Tagless input
 * comes back wrapped in <p>, so its entities are never mistaken for
 * legacy plain text.
 */
export function sanitizeRichText(input: string): string {
  const normalized = input
    .replace(/&nbsp;/gi, " ")
    .replace(/<(\/?)b(\s[^>]*)?>/gi, "<$1strong>")
    .replace(/<(\/?)i(\s[^>]*)?>/gi, "<$1em>")
    .replace(/<(\/?)div(\s[^>]*)?>/gi, "<$1p>")
    // Drop attributes from allowed tags (class=, style= from paste/editor).
    .replace(/<(\/?)(p|br|strong|em|ul|ol|li)\s[^>]*>/gi, "<$1$2>");
  let out = escapeMarkup(normalized);
  for (const tag of ALLOWED) {
    out = out
      .replace(new RegExp(`&lt;${tag}\\s*/?&gt;`, "gi"), tag === "br" ? "<br>" : `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, "gi"), tag === "br" ? "" : `</${tag}>`);
  }
  // Editor leftovers: lists the browser nested inside a <p> (invalid HTML),
  // empty paragraphs, trailing breaks.
  out = out
    .replace(/<p>\s*(<(ul|ol)>)/g, "$1")
    .replace(/(<\/(ul|ol)>)\s*<\/p>/g, "$1")
    .replace(/<p>(\s|<br>)*<\/p>/g, "")
    .replace(/(<br>\s*)+(<\/(p|li)>)/g, "$2")
    .trim();
  return out && !isRichText(out) ? `<p>${out}</p>` : out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Plain text for places that can't show formatting (SEO meta, chat, exports). */
export function richTextToPlain(s: string | null | undefined): string {
  if (!s) return "";
  if (!isRichText(s)) return s;
  return decodeEntities(
    s
      .replace(/<li>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|ul|ol|div)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Legacy plain text → editor HTML: blank-line paragraphs, single newlines as
 * <br>, and lines starting "•", "-" or "*" grouped into a bulleted list.
 */
export function plainTextToRichText(s: string | null | undefined): string {
  if (!s) return "";
  if (isRichText(s)) return sanitizeRichText(s);
  const blocks: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(`<p>${para.map(escapeHtml).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>${list.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = line.match(/^[•\-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.join("");
}
