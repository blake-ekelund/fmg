/**
 * Blog blocks → the HTML the storefront renders (blog_posts.body).
 *
 * The output is deliberately plain: semantic tags (h2/h3/p/ul/ol/blockquote/
 * img/figure) that each store's article typography already styles, plus a few
 * inline styles for the elements it doesn't (buttons, cards, callouts,
 * columns). Inline styles survive the stores' sanitizeBlogHtml, which only
 * strips script vectors. No classes — the stores' Tailwind build would never
 * see them.
 *
 * `editor: true` adds data-bb / data-bb-col markers so the builder canvas can
 * select, drag, and drop on the very same markup. Saved HTML never has them.
 */

import type { BlogBrand } from "@/lib/blogPosts";
import {
  BLOG_THEMES,
  type BlogBlock,
  type BlogContentBlock,
  type SectionBlock,
} from "./blocks";

type Theme = (typeof BLOG_THEMES)[BlogBrand];

/** The Unsplash photographer behind the post's hero (cover) image. */
export type HeroCredit = { name: string; profileUrl: string; unsplashUrl: string };

/** `heroCredit` appends "Cover photo by … on Unsplash" at the END of the body:
 *  the hero has no caption slot, and anything placed before the intro would
 *  steal NI's lead-paragraph styling (it targets the body's first <p>). */
type Opts = { editor?: boolean; heroCredit?: HeroCredit | null };

/** Just the credit line, for the builder canvas (which renders it outside
 *  the editable blocks). */
export function renderHeroCredit(c: HeroCredit, brand: BlogBrand): string {
  return heroCreditHtml(c, BLOG_THEMES[brand]);
}

function heroCreditHtml(c: HeroCredit, t: Theme): string {
  const link = (href: string, text: string) =>
    `<a href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener" style="color:inherit">${escapeHtml(text)}</a>`;
  return (
    `<div style="margin-top:40px;font-size:12px;color:${t.muted}">` +
    `Cover photo by ${link(c.profileUrl, c.name)} on ${link(c.unsplashUrl, "Unsplash")}` +
    `</div>`
  );
}

export function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** http(s), mailto, tel, site-relative, and #anchors. Anything else → "#". */
export function safeUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "#";
  if (/^(https?:|mailto:|tel:)/i.test(u) || u.startsWith("/") || u.startsWith("#")) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "#"; // javascript:, data:, …
  return `https://${u}`;
}

const INLINE_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a"]);

/**
 * Keep paragraph HTML to inline markup: p, br, strong/b, em/i, u, and links
 * (href only). Other tags are unwrapped (their text stays), attributes and
 * inline styles are dropped. Structure belongs in blocks, not in a paragraph.
 */
export function sanitizeInline(html: string): string {
  const cleaned = (html ?? "")
    .replace(/<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (tag, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      const closing = tag.startsWith("</");
      // Block-level tags from the rich editor become paragraph breaks.
      if (/^(div|h[1-6]|li|blockquote)$/.test(name)) return closing ? "</p>" : "<p>";
      if (!INLINE_TAGS.has(name)) return "";
      if (closing) return name === "br" ? "" : `</${name}>`;
      if (name === "a") {
        const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const href = m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
        return `<a href="${escapeHtml(safeUrl(href.replace(/&amp;/g, "&")))}">`;
      }
      return name === "br" ? "<br>" : `<${name}>`;
    });
  // Make sure the result is paragraphs, and drop empty ones.
  const wrapped = /^\s*<p>/i.test(cleaned) ? cleaned : `<p>${cleaned}</p>`;
  return wrapped
    .replace(/<p>\s*<p>/gi, "<p>")
    .replace(/<\/p>\s*<\/p>/gi, "</p>")
    .replace(/<p>(\s|&nbsp;|<br>)*<\/p>/gi, "")
    .trim();
}

function buttonHtml(t: Theme, brand: BlogBrand, text: string, url: string): string {
  const style = [
    "display:inline-block",
    "padding:12px 28px",
    `border-radius:${t.buttonRadius}`,
    `background:${t.accent}`,
    "color:#ffffff",
    "text-decoration:none",
    brand === "Sassy" ? "font-weight:800;text-transform:uppercase;letter-spacing:0.08em;font-size:13px" : "font-weight:500;letter-spacing:0.04em;font-size:14px",
  ].join(";");
  return `<a href="${escapeHtml(safeUrl(url))}" style="${style}">${escapeHtml(text || "Shop now")}</a>`;
}

function content(b: BlogContentBlock, brand: BlogBrand, t: Theme): string {
  switch (b.type) {
    case "heading": {
      const tag = b.level === 3 ? "h3" : "h2";
      return `<${tag}>${escapeHtml(b.text)}</${tag}>`;
    }
    case "paragraph":
      return sanitizeInline(b.html);
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      const items = b.items
        .map((i) => i.trim())
        .filter(Boolean)
        .map((i) => `<li>${sanitizeInline(i).replace(/^<p>|<\/p>$/g, "").replace(/<\/p>\s*<p>/g, "<br>")}</li>`)
        .join("");
      return items ? `<${tag}>${items}</${tag}>` : "";
    }
    case "quote": {
      const cite = b.cite.trim()
        ? `<p style="font-size:13px;font-style:normal;color:${t.muted}">— ${escapeHtml(b.cite.trim())}</p>`
        : "";
      return `<blockquote><p>${escapeHtml(b.text)}</p>${cite}</blockquote>`;
    }
    case "image": {
      if (!b.src.trim()) return "";
      const cap = b.caption.trim()
        ? `<figcaption style="margin-top:-12px;font-size:13px;color:${t.muted};text-align:center">${escapeHtml(b.caption.trim())}</figcaption>`
        : "";
      return `<figure style="margin:0"><img src="${escapeHtml(safeUrl(b.src))}" alt="${escapeHtml(b.alt)}" loading="lazy">${cap}</figure>`;
    }
    case "button":
      return `<p style="margin-top:28px">${buttonHtml(t, brand, b.text, b.url)}</p>`;
    case "product": {
      const img = b.imageUrl.trim()
        ? `<div style="flex:0 0 150px;max-width:100%"><img src="${escapeHtml(safeUrl(b.imageUrl))}" alt="${escapeHtml(b.name)}" loading="lazy" style="margin:0;aspect-ratio:1/1;object-fit:cover;border-radius:12px"></div>`
        : "";
      const price = b.price.trim()
        ? `<p style="margin-top:6px;font-weight:600;color:${t.ink}">${escapeHtml(b.price.trim())}</p>`
        : "";
      return (
        `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:20px;margin-top:28px;padding:20px;border:1px solid ${t.line};border-radius:20px">` +
        img +
        `<div style="flex:1 1 220px;min-width:0">` +
        `<h3 style="margin-top:0">${escapeHtml(b.name)}</h3>` +
        (b.blurb.trim() ? `<p style="margin-top:8px">${escapeHtml(b.blurb.trim())}</p>` : "") +
        price +
        `<p style="margin-top:14px">${buttonHtml(t, brand, "Shop now", b.url)}</p>` +
        `</div></div>`
      );
    }
    case "divider":
      return `<hr style="margin:40px 0;border:0;border-top:1px solid ${t.line}">`;
  }
}

function section(s: SectionBlock, brand: BlogBrand, t: Theme, opts: Opts): string {
  const cols = s.columns.map((c) => {
    const inner = c.blocks.map((b) => wrap(b, content(b, brand, t), opts)).join("");
    return { id: c.id, inner };
  });
  const colAttr = (id: string) => (opts.editor ? ` data-bb-col="${escapeHtml(id)}"` : "");

  if (s.layout === "callout") {
    const c = cols[0] ?? { id: "", inner: "" };
    return `<div style="margin-top:32px;padding:4px 28px 28px;border-radius:20px;background:${t.tint}"${colAttr(c.id)}>${c.inner}</div>`;
  }
  const gallery = s.layout === "gallery";
  const basis = gallery ? "180px" : "240px";
  return (
    `<div style="display:flex;flex-wrap:wrap;gap:${gallery ? "12px" : "28px"};align-items:${gallery ? "flex-start" : "center"};margin-top:32px">` +
    cols
      .map((c) => `<div style="flex:1 1 ${basis};min-width:0"${colAttr(c.id)}>${c.inner}</div>`)
      .join("") +
    `</div>`
  );
}

function wrap(b: BlogBlock, html: string, opts: Opts): string {
  if (!opts.editor) return html;
  // Empty output (e.g. an image with no src yet) still needs something to click.
  const body = html || `<p style="color:#9ca3af;font-style:italic">Empty ${b.type} — pick it to fill it in</p>`;
  const locked = b.type === "intro" || b.type === "closing";
  return `<div data-bb="${escapeHtml(b.id)}" data-bb-type="${b.type}" draggable="${locked ? "false" : "true"}">${body}</div>`;
}

export function renderBlogBlock(b: BlogBlock, brand: BlogBrand, opts: Opts = {}): string {
  const t = BLOG_THEMES[brand];
  switch (b.type) {
    case "intro":
      return wrap(b, sanitizeInline(b.html), opts);
    case "closing":
      return wrap(
        b,
        `<aside style="margin-top:56px;padding:8px 32px 36px;border-radius:24px;background:${t.tint};text-align:center">` +
          `<h2>${escapeHtml(b.heading)}</h2>` +
          (b.text.trim() ? `<p>${escapeHtml(b.text.trim())}</p>` : "") +
          `<p style="margin-top:22px">${buttonHtml(t, brand, b.buttonText, b.url)}</p>` +
          `</aside>`,
        opts,
      );
    case "section":
      return wrap(b, section(b, brand, t, opts), opts);
    default:
      return wrap(b, content(b, brand, t), opts);
  }
}

export function renderBlogBlocks(blocks: BlogBlock[], brand: BlogBrand, opts: Opts = {}): string {
  const html = blocks.map((b) => renderBlogBlock(b, brand, opts)).join("\n");
  return opts.heroCredit ? `${html}\n${heroCreditHtml(opts.heroCredit, BLOG_THEMES[brand])}` : html;
}

/** Plain text of a post, for word counts and excerpts. */
export function blogBlocksText(blocks: BlogBlock[]): string {
  return renderBlogBlocks(blocks, "Sassy")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
