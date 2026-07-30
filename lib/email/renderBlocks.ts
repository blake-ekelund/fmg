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

import type { EmailBlock, SectionBlock, CaptionBlock, TextAlign, FontFamily, VAlign } from "@/components/templates/types";

const DEFAULT_WIDTH = 600;
// The document wrapper pads the content column by this much on each side (see
// the outer `padding:24px 12px` td below). At a viewport equal to the design
// width the white column is really `width - DOC_HPAD*2`, which section columns
// must respect or they overflow-and-stack at the exact width clients render.
const DOC_HPAD = 12;

export type RenderBlocksOptions = {
  /** Outer canvas colour behind the 600px content column. */
  pageBackground?: string;
  /** Hidden preheader shown in the inbox list after the subject. */
  previewText?: string;
  /** Content column width in px. */
  contentWidth?: number;
  /**
   * Editor-only: tag each block's cell with data-block-id so the canvas iframe
   * can map clicks back to blocks. Never set for a real send — it only ADDS an
   * attribute, so send output with this off is byte-identical to before.
   */
  editable?: boolean;
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

/**
 * Normalise spacing inside a text block's authored HTML. Block-level tags carry
 * the browser/client default top+bottom margin (~1em), which stacks on top of
 * the block's own padding and reads as surprise whitespace — most visibly a
 * one-line paragraph rendering in a tall box. We set an explicit inline
 * bottom-margin on each block tag (so the padding control owns the OUTER
 * spacing) and trim the last one to zero, leaving clean inter-paragraph gaps.
 *
 * Inline (not a <style> block) on purpose: it survives Outlook's Word engine,
 * which drops <style>. Runs after sanitising, where every allowed block tag is
 * bare (no attributes), so the match is exact.
 */
const SPACING_TAGS = "p|h1|h2|h3|h4|ul|ol|blockquote";
export function spaceBlocks(safeHtml: string): string {
  let html = safeHtml.replace(new RegExp(`<(${SPACING_TAGS})>`, "gi"), '<$1 style="margin:0 0 12px;">');
  const styled = new RegExp(`<(${SPACING_TAGS}) style="margin:0 0 12px;">`, "gi");
  const matches = [...html.matchAll(styled)];
  if (matches.length) {
    const last = matches[matches.length - 1];
    const idx = last.index ?? 0;
    // Trim the trailing margin so the block hugs its bottom padding.
    html = html.slice(0, idx) + `<${last[1]} style="margin:0;">` + html.slice(idx + last[0].length);
  }
  return html;
}

/* ─── Per-block rendering ─────────────────────────────────────────────────── */

/**
 * Render a block and, in editor mode, tag its first cell with data-block-id so
 * the canvas can identify what was clicked. The attribute injection is a no-op
 * when `editable` is false, keeping send output unchanged.
 */
function renderBlockTagged(block: EmailBlock, width: number, editable: boolean): string {
  let html = renderBlock(block, width, editable);
  // Tag the block's OWN cell before margins add untagged spacer rows around it,
  // so a click still maps to the block and not the surrounding gap.
  if (editable) html = html.replace(/<td/, `<td data-block-id="${escapeHtml(block.id)}"`);
  return applyMargins(html, block.marginTop, block.marginBottom);
}

/** A transparent full-width spacer row — the email-safe way to add vertical
 *  space. Works in every client (Gmail/Outlook included), unlike CSS margins. */
function spacerRow(height: number): string {
  const h = Math.round(height);
  if (h <= 0) return "";
  return `<tr><td height="${h}" style="height:${px(h)};line-height:${px(h)};font-size:0;">&nbsp;</td></tr>`;
}

/**
 * Apply a block's optional `marginTop`/`marginBottom` (either may be negative).
 *
 * A block renders as one `<tr>` in its surrounding table, so the space around it
 * is added as sibling rows, not CSS margin:
 *
 *   - POSITIVE space → a real spacer `<tr>` above/below. Honoured by EVERY email
 *     client, and transparent (it shows whatever is behind — the white column
 *     for a section, the section/column background for a nested block). This is
 *     the reliable path and the reason margins now actually work in the inbox.
 *   - NEGATIVE space (overlap) → a negative CSS margin on a div wrapping the
 *     cell's content. Table rows can't truly overlap in email, so this is
 *     best-effort: it pulls content up in the editor and lenient clients
 *     (Apple Mail / iOS) but Gmail and Outlook ignore it.
 */
function applyMargins(html: string, marginTop?: number, marginBottom?: number): string {
  const mt = Math.round(marginTop ?? 0);
  const mb = Math.round(marginBottom ?? 0);
  if ((!mt && !mb) || !html.startsWith("<tr>")) return html;

  // Negative values: wrap the cell's inner content in a negatively-margined div.
  let core = html;
  const negTop = mt < 0 ? mt : 0;
  const negBot = mb < 0 ? mb : 0;
  if (negTop || negBot) {
    const tdStart = html.indexOf("<td");
    const openEnd = tdStart >= 0 ? html.indexOf(">", tdStart) : -1;
    const closeStart = html.lastIndexOf("</td>");
    if (openEnd >= 0 && closeStart > openEnd) {
      const inner = html.slice(openEnd + 1, closeStart);
      const style = (negTop ? `margin-top:${negTop}px;` : "") + (negBot ? `margin-bottom:${negBot}px;` : "");
      core = html.slice(0, openEnd + 1) + `<div style="${style}">${inner}</div>` + html.slice(closeStart);
    }
  }

  // Positive values: real spacer rows above/below.
  return (mt > 0 ? spacerRow(mt) : "") + core + (mb > 0 ? spacerRow(mb) : "");
}

function renderBlock(block: EmailBlock, width: number, editable = false): string {
  switch (block.type) {
    case "header": {
      const inner = block.logoUrl
        ? `<img src="${safeUrl(block.logoUrl)}" alt="${escapeHtml(block.companyName)}" height="40" style="display:block;margin:0 auto;border:0;height:40px;max-height:40px;width:auto;">`
        : `<div style="font-family:${fontStack(block.fontFamily ?? "sans")};font-size:${px(block.fontSize ?? 20)};font-weight:bold;letter-spacing:0.5px;color:${escapeHtml(block.textColor)};">${escapeHtml(block.companyName)}</div>`;
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
      return row(`<div style="${style}">${spaceBlocks(sanitizeInlineHtml(block.html))}</div>`, {
        padding: block.padding,
        bg: block.bgColor,
      });
    }

    case "image": {
      const inner = Math.max(1, width - block.padding * 2);
      const w =
        typeof block.width === "number"
          ? Math.max(1, Math.round((inner * Math.min(100, Math.max(1, block.width))) / 100))
          : block.width === "full"
            ? inner
            : block.width === "half"
              ? Math.round(inner / 2)
              : Math.round(inner / 3);
      if (!block.src) {
        // Nothing ships for an empty image — but the editor needs a visible,
        // clickable target so you can see where it goes and set it.
        if (!editable) return "";
        return row(
          `<div align="${alignAttr(block.align)}" style="text-align:${alignAttr(block.align)};">` +
            `<div style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;` +
            `width:${px(w)};max-width:100%;aspect-ratio:1/1;padding:12px;border:2px dashed #cbd5e1;` +
            `border-radius:${px(block.borderRadius)};background:#f8fafc;color:#94a3b8;` +
            `font:13px/1.4 -apple-system,'Segoe UI',Arial,sans-serif;text-align:center;">` +
            `Click to add an image</div></div>`,
          { padding: block.padding },
        );
      }
      // Alt-text styling (color/font/line-height) is inherited by most clients
      // when they render the ALT in place of a blocked image — so a blocked
      // image degrades to legible, readable text instead of a tiny broken glyph.
      // It has no effect once the image actually loads.
      const img =
        `<img src="${safeUrl(block.src)}" alt="${escapeHtml(block.alt)}" width="${w}" ` +
        `style="display:block;border:0;width:${px(w)};max-width:100%;height:auto;border-radius:${px(block.borderRadius)};` +
        `color:#6b7280;font-family:${fontStack("sans")};font-size:13px;line-height:1.4;">`;
      const wrapped = block.linkUrl
        ? `<a href="${safeUrl(block.linkUrl)}" target="_blank" rel="noopener noreferrer">${img}</a>`
        : img;
      // A full-width image fills the column, so alignment is moot. A narrower
      // image is a fixed-width BLOCK element, which text-align can't move — it
      // needs auto margins, plus an aligned table so Outlook's Word engine
      // (which ignores margin:auto) still positions it.
      if (w >= inner) {
        return row(`<div style="text-align:${alignAttr(block.align)};">${wrapped}</div>`, {
          padding: block.padding,
        });
      }
      const marginStyle =
        block.align === "center"
          ? "margin:0 auto;"
          : block.align === "right"
            ? "margin:0 0 0 auto;"
            : "margin:0;";
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${alignAttr(block.align)}" ` +
          `style="${marginStyle}"><tr><td style="padding:0;font-size:0;">${wrapped}</td></tr></table>`,
        { padding: block.padding },
      );
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
          `<div style="font-size:${px(block.fontSize ?? 16)};font-weight:600;color:#1f2937;">${escapeHtml(block.name)}</div>` +
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
        : editable
          ? `<div style="width:100%;box-sizing:border-box;padding:40px 12px;border:2px dashed #cbd5e1;` +
            `background:#f8fafc;color:#94a3b8;font:13px/1.4 -apple-system,'Segoe UI',Arial,sans-serif;text-align:center;">` +
            `Click to add a hero image</div>`
          : "";
      const panelBg = block.overlay ? "#1f2937" : "#f3f4f6";
      const textColor = block.overlay ? block.textColor || "#ffffff" : "#1f2937";
      const panel =
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${escapeHtml(panelBg)}">` +
        `<tr><td align="center" style="padding:24px;text-align:center;background-color:${escapeHtml(panelBg)};font-family:${fontStack("sans")};">` +
        `<div style="font-size:${px(block.fontSize ?? 24)};font-weight:700;color:${escapeHtml(textColor)};">${escapeHtml(block.heading)}</div>` +
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

    case "footer": {
      // The href is the literal {{unsubscribeUrl}} merge token, deliberately
      // NOT run through safeUrl (which would neutralise it to "#"). Bulk and
      // automation sends substitute a real per-recipient link, and the token's
      // presence in the rendered HTML is what makes those routes skip their
      // auto-appended fallback footer in favour of this block.
      const style =
        `font-family:${fontStack("sans")};font-size:${px(block.fontSize)};line-height:1.5;` +
        `color:${escapeHtml(block.textColor)};text-align:${alignAttr(block.textAlign)};`;
      const link =
        `<a href="{{unsubscribeUrl}}" target="_blank" ` +
        `style="color:${escapeHtml(block.linkColor)};text-decoration:underline;">` +
        `${escapeHtml(block.unsubscribeLabel || "Unsubscribe")}</a>`;
      return row(`<div style="${style}">${escapeHtml(block.text)} ${link}</div>`, {
        padding: block.padding,
        bg: block.bgColor,
      });
    }

    case "caption":
      return renderCaption(block, width, editable);

    case "section":
      return renderSection(block, width, editable);

    default:
      return "";
  }
}

/* ─── Caption / overlay (image + live text, image-blocked safe) ────────────── */

/**
 * An image with a real-text headline over it (overlay) or beside it in a solid
 * panel (above/below). The text is HTML, never baked into the image, so it
 * survives image blocking: for the overlay the cell's `bgColor` fills the space
 * behind the (bulletproof, VML-backed) background image and the text reads on
 * top of it; for the panel layouts the caption is its own coloured row.
 */
function renderCaption(block: CaptionBlock, width: number, editable: boolean): string {
  const align = alignAttr(block.textAlign);
  const bg = escapeHtml(block.bgColor || "#1f2937");
  const textColor = escapeHtml(block.textColor || "#ffffff");
  const heading = escapeHtml(block.heading);
  const sub = block.subheading ? escapeHtml(block.subheading) : "";
  const fs = px(block.fontSize ?? 26);
  const sans = fontStack("sans");
  const img = block.imageUrl ? safeUrl(block.imageUrl) : "";
  const hasImg = !!img && img !== "#";

  // ── Above / Below: image on one side, a solid caption panel on the other ──
  if (block.layout === "above" || block.layout === "below") {
    const inner = Math.max(1, width - block.padding * 2);
    const imageCell = hasImg
      ? `<img src="${img}" alt="${escapeHtml(block.alt || block.heading)}" width="${inner}" ` +
        `style="display:block;width:${px(inner)};max-width:100%;height:auto;border:0;color:#6b7280;font-family:${sans};font-size:14px;line-height:1.4;">`
      : editable
        ? `<div style="width:100%;box-sizing:border-box;padding:32px 12px;border:2px dashed #cbd5e1;background:#f8fafc;color:#94a3b8;font:13px/1.4 ${sans};text-align:center;">Click to add an image</div>`
        : "";
    const panel =
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="width:100%;">` +
      `<tr><td align="${align}" style="padding:16px 20px;text-align:${align};background-color:${bg};">` +
      `<div style="font-family:${sans};font-size:${fs};font-weight:700;line-height:1.2;color:${textColor};">${heading}</div>` +
      (sub ? `<div style="font-family:${sans};font-size:15px;line-height:1.4;margin-top:6px;color:${textColor};">${sub}</div>` : "") +
      `</td></tr></table>`;
    return row(block.layout === "above" ? panel + imageCell : imageCell + panel, { padding: block.padding });
  }

  // ── Overlay: bulletproof background image with the text laid over it ──
  const va = valignAttr(block.verticalAlign);
  const scrim = Math.max(0, Math.min(80, Math.round(block.scrim ?? 0)));
  const minH = Math.max(0, Math.round(block.minHeight ?? 200));
  const shadow = hasImg ? "text-shadow:0 1px 4px rgba(0,0,0,0.55);" : "";
  const scrimWrap = scrim > 0 && hasImg;
  const textBox =
    `<div style="display:inline-block;max-width:88%;` +
    (scrimWrap ? `background-color:rgba(0,0,0,${(scrim / 100).toFixed(2)});padding:12px 18px;border-radius:6px;` : "") +
    `">` +
    `<div style="font-family:${sans};font-size:${fs};font-weight:700;line-height:1.2;color:${textColor};${shadow}">${heading}</div>` +
    (sub ? `<div style="font-family:${sans};font-size:15px;line-height:1.4;margin-top:6px;color:${textColor};${shadow}">${sub}</div>` : "") +
    `</div>`;

  const bgImgCss = hasImg
    ? `background-image:url('${img}');background-position:center;background-size:cover;background-repeat:no-repeat;`
    : "";
  const bgAttr = hasImg ? ` background="${img}"` : "";
  const cellW = Math.max(1, Math.round(width - block.padding * 2));
  const vmlOpen = hasImg
    ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${cellW}px;height:${minH}px;">` +
      `<v:fill type="frame" src="${img}" color="${bg}" /><v:textbox inset="0,0,0,0"><![endif]-->`
    : "";
  const vmlClose = hasImg ? `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->` : "";

  const cell =
    `<td${bgAttr} bgcolor="${bg}" valign="${va}" height="${minH}" align="${align}" ` +
    `style="height:${px(minH)};padding:24px;text-align:${align};background-color:${bg};${bgImgCss}">` +
    vmlOpen + textBox + vmlClose +
    `</td>`;

  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>${cell}</tr></table>`,
    { padding: block.padding },
  );
}

/* ─── Sections (multi-column containers with backgrounds) ─────────────────── */

function valignAttr(v: VAlign): string {
  return v === "middle" ? "middle" : v === "bottom" ? "bottom" : "top";
}

/**
 * A section's columns use the "fluid-hybrid" pattern: each column is an
 * inline-block div (which wraps to full width on a narrow screen, giving free
 * mobile stacking) wrapped in an MSO-only ghost table cell so Outlook — which
 * ignores inline-block — still lays them side by side. `font-size:0` on the
 * container removes the whitespace gaps between inline-block elements.
 */
function renderSection(block: SectionBlock, width: number, editable = false): string {
  const pad = Math.max(0, Math.round(block.padding));
  // Size columns against the REAL content width (minus the wrapper's side
  // padding), so a multi-column section fits at a 600px client instead of
  // stacking. Images/hero use the full width (they're fluid via max-width),
  // so only the section's column math needs this correction.
  const innerW = Math.max(1, width - DOC_HPAD * 2 - pad * 2);
  const cols = Array.isArray(block.columns) ? block.columns : [];
  if (cols.length === 0) return "";

  const gap = Math.max(0, Math.round(block.gap));
  const gapTotal = gap * (cols.length - 1);
  // A few px of headroom so the columns never land exactly on the container
  // width — sub-pixel rounding in some clients would otherwise wrap (stack) the
  // last column even when the math says it fits.
  const COL_SAFETY = cols.length > 1 ? 4 : 0;
  const avail = Math.max(1, innerW - gapTotal - COL_SAFETY);
  const totalWeight = cols.reduce((s, c) => s + (c.weight || 1), 0) || 1;

  const parts: string[] = [];
  cols.forEach((c, i) => {
    const w = Math.max(1, Math.floor((avail * (c.weight || 1)) / totalWeight));
    const cpad = Math.max(0, Math.round(c.padding));
    const contentW = Math.max(1, w - cpad * 2);
    const va = valignAttr(c.verticalAlign);
    const colBg = c.bgColor ? `background-color:${escapeHtml(c.bgColor)};` : "";
    // Editor-only "add block" affordance at the bottom of each column. The
    // canvas maps a click on data-add-col back to (sectionId, columnIndex).
    const addRow = editable
      ? `<tr><td style="padding:6px 2px 0;"><div data-add-col="${escapeHtml(block.id)}:${i}" ` +
        `style="cursor:pointer;text-align:center;border:1px dashed #c7d2fe;border-radius:6px;padding:6px;` +
        `color:#4f46e5;background:#eef2ff;font:11px/1.2 -apple-system,'Segoe UI',Arial,sans-serif;">+ Add block</div></td></tr>`
      : "";
    const filled = c.blocks.map((b) => renderBlockTagged(b, contentW, editable)).join("");
    const inner =
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">` +
      (filled || (editable ? "" : `<tr><td>&nbsp;</td></tr>`)) +
      addRow +
      `</table>`;

    parts.push(`<!--[if mso]><td valign="${va}" width="${w}" style="width:${w}px;${colBg}padding:${cpad}px;"><![endif]-->`);
    parts.push(
      `<div style="display:inline-block;vertical-align:${va};width:100%;max-width:${w}px;${colBg}` +
        `padding:${cpad}px;box-sizing:border-box;">${inner}</div>`,
    );
    parts.push(`<!--[if mso]></td><![endif]-->`);

    if (i < cols.length - 1) {
      parts.push(`<div style="display:inline-block;width:${gap}px;font-size:0;line-height:0;">&nbsp;</div>`);
      parts.push(`<!--[if mso]><td width="${gap}" style="width:${gap}px;font-size:0;line-height:0;">&nbsp;</td><![endif]-->`);
    }
  });

  const columnsWrap =
    `<div style="font-size:0;text-align:center;">` +
    `<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${innerW}" align="center" style="width:${innerW}px;"><tr><![endif]-->` +
    parts.join("") +
    `<!--[if mso]></tr></table><![endif]-->` +
    `</div>`;

  return sectionRow(columnsWrap, { padding: pad, bg: block.bgColor, bgImage: block.bgImage, width });
}

/**
 * Wrap a section's content in its background row. Colour is a plain bgcolor;
 * a background image gets the "bulletproof" treatment — a VML rect fills the
 * cell in Outlook while everyone else uses the CSS background shorthand.
 */
function sectionRow(
  inner: string,
  opts: { padding: number; bg: string; bgImage: string; width: number },
): string {
  const pad = px(opts.padding);
  const bg = opts.bg ? escapeHtml(opts.bg) : "";
  const bgAttr = bg ? ` bgcolor="${bg}"` : "";
  const img = opts.bgImage ? safeUrl(opts.bgImage) : "";
  const cssBg =
    (bg ? `background-color:${bg};` : "") +
    (img ? `background-image:url('${img}');background-position:center;background-size:cover;background-repeat:no-repeat;` : "");

  if (!img || img === "#") {
    return `<tr><td${bgAttr} style="padding:${pad};${cssBg}">${inner}</td></tr>`;
  }

  const fillColor = bg || "#ffffff";
  const vmlOpen =
    `<!--[if gte mso 9]>` +
    `<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${Math.round(opts.width)}px;">` +
    `<v:fill type="frame" src="${img}" color="${fillColor}" />` +
    `<v:textbox inset="0,0,0,0"><![endif]-->`;
  const vmlClose = `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->`;
  return (
    `<tr><td${bgAttr} background="${img}" style="padding:${pad};${cssBg}">` +
    vmlOpen +
    inner +
    vmlClose +
    `</td></tr>`
  );
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
  const editable = opts.editable ?? false;
  const body = blocks.map((b) => renderBlockTagged(b, width, editable)).join("");

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
