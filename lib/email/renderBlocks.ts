/**
 * Serialise the block-based templates from /templates into email-safe HTML.
 *
 * `components/templates/BlockRenderer` renders the same blocks as React with
 * Tailwind — flex, grid, absolute overlays, utility classes. That is fine for
 * the on-screen preview and unusable in email: Outlook renders through Word,
 * which ignores flex/grid, drops most positioning, and needs widths as
 * attributes rather than CSS.
 *
 * So this is a second, independent renderer targeting the email subset:
 *
 *   - Everything is nested `<table role="presentation">`, never divs for layout.
 *   - Every style is inline; there is no stylesheet.
 *   - Widths appear as both an attribute and an inline style.
 *   - Buttons are table cells with a padded anchor inside ("bulletproof").
 *
 * Where a block simply cannot survive the translation, it degrades to
 * something deliberate rather than something broken — see `hero` and `social`.
 *
 * Merge fields ({{firstName}} etc.) pass through untouched: substitution runs
 * against the rendered HTML afterwards, so tokens must survive escaping. They
 * do, since we never escape braces.
 */

import type { EmailBlock, TextAlign, FontFamily } from "@/components/templates/types";

const DEFAULT_WIDTH = 600;

export type RenderBlocksOptions = {
  /** Outer canvas colour behind the 600px content column. */
  pageBackground?: string;
  /** Hidden preheader shown in the inbox list after the subject. */
  previewText?: string;
  /** Content column width in px. */
  contentWidth?: number;
};

/* ─── Escaping + small helpers ────────────────────────────────────────────── */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s) and mailto survive. Anything else — javascript:, data:, a stray
 * "https://" placeholder the user never filled in — becomes "#", so a template
 * can never ship an executable href.
 */
export function safeUrl(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return "#";
  if (/^https?:\/\/\S+$/i.test(raw) || /^mailto:\S+$/i.test(raw)) {
    return escapeHtml(raw);
  }
  return "#";
}

function fontStack(f: FontFamily): string {
  if (f === "serif") return "Georgia, 'Times New Roman', serif";
  if (f === "mono") return "Consolas, Menlo, monospace";
  return "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
}

/** Outlook honours the align attribute far more reliably than text-align. */
function alignAttr(a: TextAlign): string {
  return a === "right" ? "right" : a === "center" ? "center" : "left";
}

function px(n: number): string {
  return `${Math.max(0, Math.round(n))}px`;
}

/**
 * Wrap one block's markup in a full-width row of the content table.
 * `padding` is applied on the td, never on a div — Word drops div padding.
 */
function row(inner: string, opts: { padding?: number; bg?: string } = {}): string {
  const pad = opts.padding != null ? px(opts.padding) : "0";
  const bg = opts.bg ? ` bgcolor="${escapeHtml(opts.bg)}"` : "";
  const bgStyle = opts.bg ? `background-color:${escapeHtml(opts.bg)};` : "";
  return (
    `<tr><td${bg} style="padding:${pad};${bgStyle}">` +
    inner +
    `</td></tr>`
  );
}

/* ─── Text-block sanitiser ────────────────────────────────────────────────── */

/**
 * Text blocks hold user-authored HTML (the editor writes into `block.html` and
 * the preview drops it straight into dangerouslySetInnerHTML). Before that
 * reaches a recipient's inbox it gets an allowlist pass: drop script/style and
 * anything that could execute, keep basic formatting.
 *
 * This is intentionally strict rather than clever. Anything not on the list is
 * unwrapped — its text content survives, the tag does not.
 */
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "a", "span", "h1", "h2", "h3", "h4", "blockquote",
]);

export function sanitizeInlineHtml(html: string): string {
  let out = html;

  // Whole elements whose *content* must go too, not just the tag.
  out = out.replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1\s*>/gi, "");
  out = out.replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, "");
  // HTML comments — Outlook conditional comments could smuggle markup.
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;

    // Anchors keep a validated href and gain target/rel; everything else is
    // rendered bare. Dropping style/class here is deliberate — a pasted style
    // is the most common way an email breaks in Outlook.
    if (tag === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const value = href ? (href[2] ?? href[3] ?? href[4] ?? "") : "";
      return `<a href="${safeUrl(value)}" target="_blank" rel="noopener noreferrer">`;
    }
    return `<${tag}>`;
  });

  return out;
}

/* ─── Per-block rendering ─────────────────────────────────────────────────── */

function renderBlock(block: EmailBlock, width: number): string {
  switch (block.type) {
    case "header": {
      const inner = block.logoUrl
        ? `<img src="${safeUrl(block.logoUrl)}" alt="${escapeHtml(block.companyName)}" height="40" style="display:block;margin:0 auto;border:0;height:40px;max-height:40px;width:auto;">`
        : `<div style="font-size:20px;font-weight:bold;letter-spacing:0.5px;color:${escapeHtml(block.textColor)};">${escapeHtml(block.companyName)}</div>`;
      return row(`<div align="center" style="text-align:center;color:${escapeHtml(block.textColor)};">${inner}</div>`, {
        padding: block.padding,
        bg: block.bgColor,
      });
    }

    case "text": {
      const style =
        `font-family:${fontStack(block.fontFamily)};` +
        `font-size:${px(block.fontSize)};line-height:1.5;` +
        `color:${escapeHtml(block.textColor)};text-align:${alignAttr(block.textAlign)};`;
      return row(`<div style="${style}">${sanitizeInlineHtml(block.html)}</div>`, {
        padding: block.padding,
        bg: block.bgColor,
      });
    }

    case "image": {
      if (!block.src) return ""; // the editor's "drop image here" placeholder is preview-only
      const inner = Math.max(1, width - block.padding * 2);
      const w = block.width === "full" ? inner : block.width === "half" ? Math.round(inner / 2) : Math.round(inner / 3);
      const img =
        `<img src="${safeUrl(block.src)}" alt="${escapeHtml(block.alt)}" width="${w}" ` +
        `style="display:block;border:0;width:${px(w)};max-width:100%;height:auto;border-radius:${px(block.borderRadius)};">`;
      const wrapped = block.linkUrl
        ? `<a href="${safeUrl(block.linkUrl)}" target="_blank" rel="noopener noreferrer">${img}</a>`
        : img;
      return row(`<div align="${alignAttr(block.align)}" style="text-align:${alignAttr(block.align)};">${wrapped}</div>`, {
        padding: block.padding,
      });
    }

    case "button":
      return row(button(block.text, block.url, block.bgColor, block.textColor, block.borderRadius, block.fontSize, block.align), {
        padding: block.padding,
      });

    case "divider":
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
          `<td style="font-size:0;line-height:0;border-top:${px(block.thickness)} ${block.style} ${escapeHtml(block.color)};">&nbsp;</td>` +
          `</tr></table>`,
        { padding: block.padding },
      );

    case "spacer":
      return (
        `<tr><td height="${Math.round(block.height)}" ` +
        `style="height:${px(block.height)};font-size:0;line-height:0;">&nbsp;</td></tr>`
      );

    case "columns": {
      // Grid becomes a table row of cells. Stacking on narrow screens would
      // need media queries, which several clients strip — fixed cells are the
      // predictable choice.
      const inner = Math.max(1, width - block.padding * 2);
      const count = block.columns;
      const cellW = Math.floor((inner - block.gap * (count - 1)) / count);
      const cells = block.items
        .slice(0, count)
        .map((col, i) => {
          const img = col.imageUrl
            ? `<img src="${safeUrl(col.imageUrl)}" alt="${escapeHtml(col.heading)}" width="${cellW}" style="display:block;width:${px(cellW)};max-width:100%;height:auto;border:0;border-radius:4px;margin-bottom:8px;">`
            : "";
          const gutter = i < count - 1 ? `padding-right:${px(block.gap)};` : "";
          return (
            `<td width="${cellW}" valign="top" style="width:${px(cellW)};${gutter}text-align:center;font-family:${fontStack("sans")};">` +
            img +
            `<div style="font-size:14px;font-weight:600;color:#1f2937;">${escapeHtml(col.heading)}</div>` +
            `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(col.text)}</div>` +
            `</td>`
          );
        })
        .join("");
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${cells}</tr></table>`,
        { padding: block.padding },
      );
    }

    case "product": {
      const imgCell = block.imageUrl
        ? `<td width="96" valign="top" style="width:96px;padding-right:16px;">` +
          `<img src="${safeUrl(block.imageUrl)}" alt="${escapeHtml(block.name)}" width="96" style="display:block;width:96px;height:auto;border:0;border-radius:8px;">` +
          `</td>`
        : "";
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>` +
          imgCell +
          `<td valign="top" style="font-family:${fontStack("sans")};">` +
          `<div style="font-size:16px;font-weight:600;color:#1f2937;">${escapeHtml(block.name)}</div>` +
          `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(block.description)}</div>` +
          `<div style="font-size:16px;font-weight:700;color:#111827;margin-top:8px;">${escapeHtml(block.price)}</div>` +
          (block.buttonText
            ? `<div style="margin-top:8px;">${button(block.buttonText, block.buttonUrl, "#111827", "#ffffff", 6, 12, "left")}</div>`
            : "") +
          `</td></tr></table>`,
        { padding: block.padding, bg: block.bgColor },
      );
    }

    case "social": {
      // The preview draws lucide icon components, which don't exist in an
      // email. Text links need no image hosting and never break.
      const links = [
        ["Instagram", block.instagram],
        ["Facebook", block.facebook],
        ["TikTok", block.tiktok],
        ["Website", block.website],
      ].filter(([, url]) => !!url);
      if (links.length === 0) return "";
      const rendered = links
        .map(
          ([label, url]) =>
            `<a href="${safeUrl(url as string)}" target="_blank" rel="noopener noreferrer" ` +
            `style="color:#6b7280;text-decoration:underline;font-size:13px;padding:0 8px;">${escapeHtml(label as string)}</a>`,
        )
        .join("");
      return row(
        `<div align="${alignAttr(block.align)}" style="text-align:${alignAttr(block.align)};font-family:${fontStack("sans")};">${rendered}</div>`,
        { padding: block.padding },
      );
    }

    case "hero": {
      // The preview absolutely-positions text over the image. Word can't do
      // that, and background-image is unreliable across clients, so the hero
      // becomes image-on-top / text-panel-below. Deliberate, and it reads as a
      // designed layout rather than a broken overlay.
      const inner = Math.max(1, width - block.padding * 2);
      const img = block.imageUrl
        ? `<img src="${safeUrl(block.imageUrl)}" alt="${escapeHtml(block.heading)}" width="${inner}" style="display:block;width:${px(inner)};max-width:100%;height:auto;border:0;">`
        : "";
      const panelBg = block.overlay ? "#1f2937" : "#f3f4f6";
      const textColor = block.overlay ? block.textColor || "#ffffff" : "#1f2937";
      const panel =
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${escapeHtml(panelBg)}">` +
        `<tr><td align="center" style="padding:24px;text-align:center;background-color:${escapeHtml(panelBg)};font-family:${fontStack("sans")};">` +
        `<div style="font-size:24px;font-weight:700;color:${escapeHtml(textColor)};">${escapeHtml(block.heading)}</div>` +
        (block.subheading
          ? `<div style="font-size:14px;margin-top:8px;color:${escapeHtml(textColor)};opacity:0.9;">${escapeHtml(block.subheading)}</div>`
          : "") +
        (block.buttonText
          ? `<div style="margin-top:16px;">${button(block.buttonText, block.buttonUrl, "#ffffff", "#1a1a1a", 8, 14, "center")}</div>`
          : "") +
        `</td></tr></table>`;
      return row(img + panel, { padding: block.padding });
    }

    case "promotion": {
      const accent = escapeHtml(block.accentColor);
      const text = escapeHtml(block.textColor);
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:2px dashed ${accent};border-radius:12px;">` +
          `<tr><td bgcolor="${accent}" style="padding:12px 20px;background-color:${accent};font-family:${fontStack("sans")};">` +
          `<span style="color:#ffffff;font-weight:700;font-size:13px;letter-spacing:0.5px;">${escapeHtml(block.discountLabel || "SPECIAL OFFER")}</span>` +
          `</td></tr>` +
          `<tr><td align="center" style="padding:16px 20px;text-align:center;font-family:${fontStack("sans")};">` +
          `<div style="font-size:18px;font-weight:700;color:${text};">${escapeHtml(block.headline || "Promotion")}</div>` +
          `<div style="font-size:13px;margin-top:4px;color:${text};opacity:0.8;">${escapeHtml(block.description)}</div>` +
          (block.promoCode
            ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:12px auto 0;"><tr>` +
              `<td style="border:2px dashed ${accent};border-radius:8px;padding:8px 20px;text-align:center;">` +
              `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:${text};opacity:0.6;">Use Code</div>` +
              `<div style="font-size:18px;font-weight:700;font-family:${fontStack("mono")};letter-spacing:2px;color:${accent};">${escapeHtml(block.promoCode)}</div>` +
              `</td></tr></table>`
            : "") +
          (block.expiresLabel
            ? `<div style="font-size:12px;margin-top:8px;color:${text};opacity:0.6;">${escapeHtml(block.expiresLabel)}</div>`
            : "") +
          (block.buttonText
            ? `<div style="margin-top:16px;">${button(block.buttonText, block.buttonUrl, block.accentColor, "#ffffff", 8, 14, "center")}</div>`
            : "") +
          `</td></tr></table>`,
        { padding: block.padding, bg: block.bgColor },
      );
    }

    default:
      return "";
  }
}

/** Table-wrapped anchor — the padding lands on a td so Word honours it. */
function button(
  text: string,
  url: string,
  bg: string,
  color: string,
  radius: number,
  fontSize: number,
  align: TextAlign,
): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignAttr(align)}" ` +
    `style="margin:${align === "center" ? "0 auto" : "0"};"><tr>` +
    `<td bgcolor="${escapeHtml(bg)}" style="background-color:${escapeHtml(bg)};border-radius:${px(radius)};">` +
    `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer" ` +
    `style="display:inline-block;padding:12px 32px;font-family:${fontStack("sans")};font-size:${px(fontSize)};` +
    `font-weight:600;color:${escapeHtml(color)};text-decoration:none;border-radius:${px(radius)};">` +
    `${escapeHtml(text)}</a></td></tr></table>`
  );
}

/* ─── Document ────────────────────────────────────────────────────────────── */

export function renderBlocksToEmailHtml(
  blocks: EmailBlock[],
  opts: RenderBlocksOptions = {},
): string {
  const width = opts.contentWidth ?? DEFAULT_WIDTH;
  const page = opts.pageBackground ?? "#f4f4f5";
  const body = blocks.map((b) => renderBlock(b, width)).join("");

  // Hidden preheader: the text an inbox list shows after the subject line.
  // Without one, clients scrape whatever the first visible text happens to be.
  const preheader = opts.previewText
    ? `<div style="display:none;font-size:1px;color:${escapeHtml(page)};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">` +
      `${escapeHtml(opts.previewText)}</div>`
    : "";

  // Fluid-hybrid width. A hard width="600" makes the column overflow a phone
  // (the layout goes to 624px at a 375px viewport, and the client is left to
  // scale it). Instead the content table is width="100%" capped by max-width,
  // which shrinks properly everywhere — except Outlook/Word, which ignores
  // max-width and would run the column to the full window. The MSO-only
  // conditional table below pins it to `width` there and is invisible to every
  // other client.
  const msoOpen =
    `<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" align="center"><tr><td><![endif]-->`;
  const msoClose = `<!--[if mso]></td></tr></table><![endif]-->`;

  return (
    `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${escapeHtml(page)};">` +
    preheader +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="background-color:${escapeHtml(page)};"><tr><td align="center" style="padding:24px 12px;">` +
    msoOpen +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;max-width:${px(width)};margin:0 auto;background-color:#ffffff;">` +
    body +
    `</table>` +
    msoClose +
    `</td></tr></table></body></html>`
  );
}
