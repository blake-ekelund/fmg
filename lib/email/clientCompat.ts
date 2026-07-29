/**
 * Cross-client email compatibility: the roster of clients we preview against,
 * and a static linter that flags HTML/CSS the major clients are known to choke
 * on. This is dependency-free and isomorphic so the browser preview matrix and
 * unit tests can both use it.
 *
 * The linter is deliberately honest: it reports *known* rendering pitfalls from
 * a template's markup. It does not — and in a browser cannot — reproduce
 * Outlook desktop's Word engine pixel-for-pixel. Treat the visual preview as an
 * approximation and this report as the reliable signal.
 */

export type EmailClientId =
  | "apple-mail"
  | "gmail"
  | "outlook-web"
  | "outlook-desktop"
  | "zoho";

export type EmailClient = {
  id: EmailClientId;
  name: string;
  /** Rendering engine, shown in the preview chrome. */
  engine: string;
  /** Realistic content width in px for the preview frame. */
  width: number;
  /** Whether the on-screen render is only an approximation of the real client. */
  approximate: boolean;
  /** Whether the client honours @media (prefers-color-scheme: dark). */
  supportsDarkMedia: boolean;
  /** One-line description of where this client sits on the support spectrum. */
  blurb: string;
};

/**
 * Ordered best-support → worst-support. Outlook desktop is last and flagged as
 * an approximation because its Word engine can't be reproduced in a browser.
 */
export const EMAIL_CLIENTS: readonly EmailClient[] = [
  {
    id: "apple-mail",
    name: "Apple Mail",
    engine: "WebKit",
    width: 600,
    approximate: false,
    supportsDarkMedia: true,
    blurb: "Best-in-class CSS support; honours dark-mode media queries.",
  },
  {
    id: "gmail",
    name: "Gmail",
    engine: "Blink (Chromium)",
    width: 600,
    approximate: false,
    supportsDarkMedia: false,
    blurb: "Strips <style> when the message is clipped past ~102 KB; force-darkens colors.",
  },
  {
    id: "outlook-web",
    name: "Outlook.com",
    engine: "Blink (web)",
    width: 600,
    approximate: false,
    supportsDarkMedia: false,
    blurb: "Modern web client, but rewrites some CSS and applies its own dark theme.",
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    engine: "Blink",
    width: 600,
    approximate: false,
    supportsDarkMedia: true,
    blurb: "Solid modern support, close to Apple Mail.",
  },
  {
    id: "outlook-desktop",
    name: "Outlook (Windows)",
    engine: "Word (mso)",
    width: 600,
    approximate: true,
    supportsDarkMedia: false,
    blurb: "Word rendering engine — no rounded corners, shadows, background images, or media queries.",
  },
] as const;

export function clientById(id: EmailClientId): EmailClient {
  return EMAIL_CLIENTS.find((c) => c.id === id) ?? EMAIL_CLIENTS[0];
}

export type CompatSeverity = "error" | "warning" | "info";

export type CompatFinding = {
  /** Stable id for the rule, handy for tests and keys. */
  rule: string;
  severity: CompatSeverity;
  /** Clients this issue affects. */
  clients: EmailClientId[];
  /** Short headline. */
  title: string;
  /** What breaks and what to do about it. */
  detail: string;
  /** How many times the pattern occurs, when meaningful. */
  count?: number;
};

const ALL_CLIENTS: EmailClientId[] = EMAIL_CLIENTS.map((c) => c.id);
const OUTLOOK: EmailClientId[] = ["outlook-desktop"];
const NON_WEBKIT: EmailClientId[] = ["gmail", "outlook-web", "outlook-desktop"];

/** Gmail clips a single message once its raw size crosses ~102 KB. */
export const GMAIL_CLIP_BYTES = 102 * 1024;

function count(re: RegExp, html: string): number {
  const m = html.match(re);
  return m ? m.length : 0;
}

/**
 * Inspect an email's final HTML and return known cross-client rendering issues,
 * most severe first. Presence-based and conservative — a finding means "this
 * pattern is known to misbehave in the listed clients", not a guaranteed break.
 */
export function lintEmailHtml(html: string): CompatFinding[] {
  const findings: CompatFinding[] = [];
  // Strip HTML comments so mso conditional comments etc. don't create false hits.
  const src = html.replace(/<!--[\s\S]*?-->/g, "");

  // Size / Gmail clipping.
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > GMAIL_CLIP_BYTES) {
    findings.push({
      rule: "gmail-clip",
      severity: "warning",
      clients: ["gmail"],
      title: `Message is ${(bytes / 1024).toFixed(0)} KB — over Gmail's ~102 KB clip limit`,
      detail:
        "Gmail truncates the message with a “[Message clipped]” link and drops any <style> or content past the cut. Trim the HTML or move styles inline.",
    });
  }

  // External stylesheet — never fetched by mail clients.
  const linkCss = count(/<link\b[^>]*rel\s*=\s*["']?stylesheet/gi, src);
  if (linkCss > 0) {
    findings.push({
      rule: "external-stylesheet",
      severity: "error",
      clients: ALL_CLIENTS,
      title: "External stylesheet won't load",
      detail:
        "Mail clients don't fetch <link rel=\"stylesheet\">. Inline the styles or move them into a <style> block (and inline the critical ones).",
      count: linkCss,
    });
  }

  // Background images — Outlook desktop needs VML to show them.
  const bgImg = count(/background(-image)?\s*:\s*[^;"']*url\(/gi, src);
  if (bgImg > 0) {
    findings.push({
      rule: "background-image",
      severity: "warning",
      clients: OUTLOOK,
      title: "CSS background images won't show in Outlook (Windows)",
      detail:
        "Word ignores CSS background images. Add a VML fallback (mso conditional) or a solid bgcolor so the layout still reads.",
      count: bgImg,
    });
  }

  // @media — ignored by Word, so responsive/dark tweaks don't apply.
  const media = count(/@media[^{]*\{/gi, src);
  if (media > 0) {
    findings.push({
      rule: "media-queries",
      severity: "info",
      clients: OUTLOOK,
      title: "Media queries are ignored in Outlook (Windows)",
      detail:
        "Word applies the base (desktop) styles only. Make sure the un-queried layout looks right on its own; treat @media as progressive enhancement.",
      count: media,
    });
  }

  // border-radius — square corners in Outlook desktop.
  if (/border-radius\s*:/i.test(src)) {
    findings.push({
      rule: "border-radius",
      severity: "info",
      clients: OUTLOOK,
      title: "Rounded corners render square in Outlook (Windows)",
      detail: "border-radius is unsupported by Word. Fine as a graceful fallback; avoid relying on it for legibility.",
    });
  }

  // box-shadow — dropped by Outlook desktop.
  if (/box-shadow\s*:/i.test(src)) {
    findings.push({
      rule: "box-shadow",
      severity: "info",
      clients: OUTLOOK,
      title: "Shadows are dropped in Outlook (Windows)",
      detail: "box-shadow is unsupported by Word. Don't depend on shadow for separating elements — use borders or bgcolor.",
    });
  }

  // position/float — unreliable in Word.
  if (/(position\s*:\s*(absolute|fixed)|float\s*:\s*(left|right))/i.test(src)) {
    findings.push({
      rule: "positioning",
      severity: "warning",
      clients: OUTLOOK,
      title: "Absolute positioning / float is unreliable in Outlook (Windows)",
      detail: "Word ignores position:absolute/fixed and mishandles float. Use nested tables and alignment for layout instead.",
    });
  }

  // SVG — unsupported almost everywhere.
  const svg = count(/<svg[\s>]/gi, src);
  if (svg > 0) {
    findings.push({
      rule: "svg",
      severity: "warning",
      clients: NON_WEBKIT,
      title: "Inline SVG won't render in most clients",
      detail: "Gmail, Outlook.com and Outlook desktop don't render inline SVG. Export to PNG and use an <img> with alt text.",
      count: svg,
    });
  }

  // Web fonts — fall back on Outlook/Gmail.
  if (/@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(src)) {
    findings.push({
      rule: "web-fonts",
      severity: "info",
      clients: NON_WEBKIT,
      title: "Custom web fonts fall back to a system font",
      detail: "Gmail and Outlook ignore @font-face / linked fonts. Set a good websafe fallback in your font-family stack.",
    });
  }

  // prefers-color-scheme — only some clients honour it.
  if (/prefers-color-scheme/i.test(src)) {
    findings.push({
      rule: "dark-mode-media",
      severity: "info",
      clients: ["gmail", "outlook-web", "outlook-desktop"],
      title: "Dark-mode styles are ignored by some clients",
      detail:
        "Only Apple Mail and Zoho honour prefers-color-scheme here. Gmail and Outlook apply their own color inversion instead — check both light and forced-dark.",
    });
  }

  // <img> without alt — nothing shows when images are blocked (Outlook default).
  const imgs = src.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((tag) => !/\salt\s*=/i.test(tag)).length;
  if (missingAlt > 0) {
    findings.push({
      rule: "img-missing-alt",
      severity: "warning",
      clients: ALL_CLIENTS,
      title: `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text`,
      detail:
        "When images are blocked (Outlook blocks by default), an image with no alt is an empty gap. Add alt text — or alt=\"\" for purely decorative images.",
      count: missingAlt,
    });
  }

  const order: Record<CompatSeverity, number> = { error: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Findings that affect a given client. */
export function findingsForClient(findings: CompatFinding[], client: EmailClientId): CompatFinding[] {
  return findings.filter((f) => f.clients.includes(client));
}
