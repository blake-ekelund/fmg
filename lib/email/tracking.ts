import { randomUUID } from "crypto";

/**
 * Convert a user's plain-text email body into tracked HTML.
 *
 * Steps:
 *   1. Detect http(s) URLs and allocate a tracking link id for each.
 *   2. HTML-escape all surrounding text and the link display text.
 *   3. Convert newlines to <br>.
 *   4. Append an invisible 1x1 pixel that hits our pixel endpoint.
 *
 * Returns the HTML body and the list of links we registered, so the caller
 * can persist them in email_message_links for click attribution.
 */

export type TrackedLink = {
  id: string;
  link_index: number;
  original_url: string;
};

export type TrackedBody = {
  html: string;
  links: TrackedLink[];
};

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildTrackedHtmlBody(opts: {
  plainText: string;
  origin: string;
  messageId: string;
}): TrackedBody {
  const { plainText, origin, messageId } = opts;
  const links: TrackedLink[] = [];
  const parts: string[] = [];
  let lastEnd = 0;
  let linkIndex = 0;

  // Reset regex state in case URL_RE was used elsewhere.
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(plainText)) !== null) {
    // Trim trailing punctuation that's almost never part of a URL.
    let url = m[0];
    let trailing = "";
    while (url.length > 1 && /[.,;:!?)\]]/.test(url[url.length - 1])) {
      trailing = url[url.length - 1] + trailing;
      url = url.slice(0, -1);
    }

    // Non-URL text before this match.
    parts.push(escapeHtml(plainText.slice(lastEnd, m.index)));

    const id = randomUUID();
    links.push({ id, link_index: linkIndex++, original_url: url });
    const trackedHref = `${origin}/api/email/link/${id}`;
    parts.push(
      `<a href="${escapeHtml(trackedHref)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>${escapeHtml(trailing)}`,
    );

    lastEnd = m.index + m[0].length;
  }
  // Tail after the last URL.
  parts.push(escapeHtml(plainText.slice(lastEnd)));

  // Newlines → <br>; preserve runs of whitespace inside lines.
  const body = parts.join("").replace(/\r\n/g, "\n").replace(/\n/g, "<br>\n");

  // 1x1 transparent pixel at the bottom. Hidden via display:none would defeat
  // tracking (some clients skip non-rendered images), so we keep it visible
  // but minimal-size with no styling that hints "tracker".
  const pixelUrl = `${origin}/api/email/pixel/${messageId}.gif`;
  const pixel = `<img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="border:0;outline:none;text-decoration:none;display:block;">`;

  const html =
    `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#111;">` +
    body +
    pixel +
    `</body></html>`;

  return { html, links };
}
