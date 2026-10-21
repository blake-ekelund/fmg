/**
 * Minimal, safe Markdown → HTML for help-assistant replies and the /help guide.
 * Escapes everything, then allows only bold, `code`, in-app links, bullets,
 * numbered steps and headings.
 */

/* Internal page links only: a single leading slash, not an API route. Anything
   else in a reply renders as literal text, so a stray URL can't become a live
   off-site link. */
export const isAppPath = (href: string) => /^\/(?!\/)/.test(href) && !href.startsWith("/api/");

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Minimal, safe Markdown → HTML: bold, `code`, links, bullets, numbered steps, headings. */
export function renderMarkdown(text: string): string {
  const fmt = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-surface px-1 py-0.5 text-[12px]">$1</code>');

  const inline = (s: string): string => {
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(s)) !== null) {
      out += fmt(s.slice(last, m.index));
      const href = m[2].trim();
      out += isAppPath(href)
        ? `<a href="${esc(href)}" class="font-medium text-brand-700 underline underline-offset-2">${fmt(m[1])}</a>`
        : fmt(m[0]);
      last = linkRe.lastIndex;
    }
    return out + fmt(s.slice(last));
  };

  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const step = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (bullet || step) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        close();
        // Bullets nested under a step close the <ol>; resume at the step's own
        // number so "3." doesn't render as a fresh "1.".
        html.push(
          kind === "ul"
            ? '<ul class="my-1 list-disc space-y-0.5 pl-4">'
            : `<ol start="${Number(step![1]) || 1}" class="my-1 list-decimal space-y-1 pl-5">`,
        );
        list = kind;
      }
      const nested = /^\s{2,}/.test(line) ? ' class="ml-4"' : "";
      html.push(`<li${nested}>${inline(bullet ? bullet[1] : step![2])}</li>`);
    } else if (heading) {
      close();
      const size = heading[1].length <= 2 ? "mt-4 text-[15px]" : "mt-3";
      html.push(`<p class="${size} font-semibold">${inline(heading[2])}</p>`);
    } else if (line.trim()) {
      close();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return html.join("");
}
