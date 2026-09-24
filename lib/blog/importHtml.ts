/**
 * HTML → blog blocks, in the browser (uses DOMParser).
 *
 * Powers "Upload HTML" in the new-post wizard and "Switch to the builder" on
 * posts written in the old rich-text editor. It keeps the words and pictures
 * and throws away the styling — the brand format supplies that — so any page
 * (a Google Doc export, a Shopify article, an old post) lands in the same
 * shape as everything else. Layout divs are walked through, not kept.
 */

import type { BlogBrand } from "@/lib/blogPosts";
import { newBlogId, type BlogBlock } from "./blocks";
import { normalizeBlogBlocks } from "./normalize";

export type ImportedHtml = { title: string; blocks: BlogBlock[] };

const SKIP = new Set(["script", "style", "noscript", "iframe", "svg", "head", "nav", "footer", "form", "button", "input"]);

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function importBlogHtml(html: string, brand: BlogBrand): ImportedHtml {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let title = text(doc.querySelector("h1") ?? doc.createElement("i")) || (doc.title ?? "").trim();
  const raw: Record<string, unknown>[] = [];

  const push = (b: Record<string, unknown>) => raw.push({ id: newBlogId(), ...b });

  const image = (img: HTMLImageElement, caption = "") => {
    const src = img.getAttribute("src") ?? "";
    if (!src || src.startsWith("data:")) return;
    push({ type: "image", src, alt: img.getAttribute("alt") ?? "", caption });
  };

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (SKIP.has(tag)) continue;
      switch (tag) {
        case "h1":
          if (!title) title = text(child);
          break;
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          if (text(child)) push({ type: "heading", level: tag === "h2" ? 2 : 3, text: text(child) });
          break;
        case "p": {
          const imgs = Array.from(child.querySelectorAll("img"));
          if (imgs.length && !text(child)) imgs.forEach((i) => image(i));
          else if (text(child)) push({ type: "paragraph", html: `<p>${child.innerHTML}</p>` });
          break;
        }
        case "ul":
        case "ol": {
          const items = Array.from(child.querySelectorAll(":scope > li")).map((li) => li.innerHTML.trim());
          if (items.length) push({ type: "list", ordered: tag === "ol", items });
          break;
        }
        case "blockquote":
          if (text(child)) push({ type: "quote", text: text(child), cite: "" });
          break;
        case "img":
          image(child as HTMLImageElement);
          break;
        case "figure": {
          const img = child.querySelector("img");
          if (img) image(img, text(child.querySelector("figcaption") ?? doc.createElement("i")));
          break;
        }
        case "hr":
          push({ type: "divider" });
          break;
        default:
          // Containers: walk in. A leaf with bare text becomes a paragraph.
          if (child.children.length) walk(child);
          else if (text(child)) push({ type: "paragraph", html: `<p>${child.innerHTML}</p>` });
      }
    }
  };

  walk(doc.body);
  return { title, blocks: normalizeBlogBlocks(raw, brand) };
}
