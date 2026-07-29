/**
 * Render a plain-text email template (source = 'text') into the finished HTML
 * document we ship — the counterpart to renderBlocks.ts (source='blocks') and
 * rawHtml.ts (source='html').
 *
 * A text template is the simplest kind of email: a plain body carrying
 * {{merge_fields}}. We escape it (so a stray `<` can't become markup), turn
 * newlines into <br>, and wrap it in a minimal, readable email shell with an
 * optional preheader. Merge tokens survive escaping untouched — `{`, `}` and
 * letters aren't escaped — and are substituted downstream by applyMergeFields,
 * exactly like the other two renderers. Rendering runs server-side at
 * send/preview time, never on the stored value.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A hidden preheader: the text an inbox list shows after the subject line. */
function preheaderMarkup(previewText: string): string {
  const escaped = escapeHtml(previewText);
  return (
    `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;` +
    `max-height:0;max-width:0;opacity:0;overflow:hidden;">${escaped}</div>`
  );
}

export type RenderTextOptions = {
  /** Hidden preheader injected just inside <body>. */
  previewText?: string;
};

/**
 * Turn a stored plain-text body into the finished email document: escaped,
 * newline-preserving, wrapped in a simple centered card.
 */
export function renderTextEmail(body: string, opts: RenderTextOptions = {}): string {
  const escaped = escapeHtml(body ?? "").replace(/\r\n|\r|\n/g, "<br>");
  const preheader = opts.previewText?.trim() ? preheaderMarkup(opts.previewText.trim()) : "";

  return (
    `<!doctype html><html><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `</head>` +
    `<body style="margin:0;padding:0;background:#f4f4f5;">` +
    preheader +
    `<div style="max-width:600px;margin:0 auto;padding:24px;` +
    `font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;` +
    `font-size:15px;line-height:1.6;color:#1f2937;background:#ffffff;">` +
    escaped +
    `</div>` +
    `</body></html>`
  );
}
