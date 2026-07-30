/**
 * Prompt builder for the email-template grader (POST /api/email/templates/grade).
 *
 * Single source of truth for what "graded" means: the six dimensions, the
 * scoring rubric, and the strict JSON contract the route parses. Kept separate
 * from the route (mirroring generatePrompt.ts) so the rubric is easy to read and
 * tune without touching request plumbing.
 */

export type GradeDimensionKey =
  | "content"
  | "design"
  | "subject"
  | "deliverability"
  | "accessibility"
  | "brand";

export type GradeDimension = { key: GradeDimensionKey; label: string; brief: string };

/** The six axes, in the order they should read on the scorecard. */
export const GRADE_DIMENSIONS: readonly GradeDimension[] = [
  {
    key: "content",
    label: "Content & copy",
    brief:
      "Clarity of the core message and value proposition; a single obvious purpose; scannable length; strong, specific copy over filler; correct grammar and spelling; sensible use of {{merge_fields}} for personalization.",
  },
  {
    key: "design",
    label: "UI/UX & visual design",
    brief:
      "Visual hierarchy and scan path; balance of image and text; whitespace and rhythm; one prominent, well-placed primary call-to-action; layout that will stack cleanly on mobile (single column, tappable buttons).",
  },
  {
    key: "subject",
    label: "Subject line & preview text",
    brief:
      "Subject length (~30–50 chars), specificity and curiosity without clickbait; preview/preheader text present and complementing (not repeating) the subject; no spam-trigger phrasing.",
  },
  {
    key: "deliverability",
    label: "Deliverability & spam risk",
    brief:
      "Spammy words/phrases, ALL-CAPS, excessive punctuation (!!!, $$$); a healthy text-to-image ratio (not an image-only email); reasonable link count; nothing that trips spam filters. Use the provided compatibility findings as ground truth.",
  },
  {
    key: "accessibility",
    label: "Accessibility",
    brief:
      "Alt text on meaningful images; adequate color contrast; readable font sizes (≥14px body); and whether the email still communicates when images are blocked (live text, not words baked into a JPG).",
  },
  {
    key: "brand",
    label: "Brand voice & compliance",
    brief:
      "Fit with the brand's voice (Natural Inspirations: warm, spa-inspired, sensory; Sassy: bold, playful, confident). CAN-SPAM basics: an unsubscribe path, a physical mailing address, and no unsubstantiated health/efficacy claims.",
  },
];

export type GradeTemplateInput = {
  name: string;
  purpose: string[];
  brand: string | null;
  channel: string | null;
  subject: string | null;
  previewText: string | null;
  /** Which underlying representation was graded. */
  source: "blocks" | "html" | "text";
  /** Rendered HTML (blocks/html) or the plain-text body (text). */
  content: string;
  /** Human-readable compatibility findings from clientCompat.lintEmailHtml. */
  compatFindings: string[];
};

const BRAND_LABEL: Record<string, string> = {
  ni: "Natural Inspirations (warm, spa-inspired, sensory, wellness-forward)",
  sassy: "Sassy (bold, playful, confident, a little cheeky)",
  both: "Natural Inspirations and/or Sassy",
};

const CHANNEL_LABEL: Record<string, string> = {
  d2c: "Direct-to-consumer shoppers",
  wholesale: "Wholesale buyers (retailers/accounts)",
  both: "Both D2C shoppers and wholesale buyers",
};

/** Trim the graded content so a single template can't blow the token budget. */
const MAX_CONTENT_CHARS = 16000;
/** When trimming, always keep the END of the email too — that's where the
    footer/unsubscribe lives, and cutting it made the grader report a missing
    opt-out on emails that have one. */
const TAIL_CHARS = 3500;

/** Head + tail with an explicit marker for the removed middle. */
function clampContent(content: string): { content: string; truncated: string } {
  if (content.length <= MAX_CONTENT_CHARS) return { content, truncated: "" };
  const head = content.slice(0, MAX_CONTENT_CHARS - TAIL_CHARS);
  const tail = content.slice(-TAIL_CHARS);
  return {
    content: `${head}\n[... middle of the email omitted for length — do NOT treat anything as missing solely because it isn't shown here ...]\n${tail}`,
    truncated: "\n[middle truncated]",
  };
}

export function buildGradePrompt(input: GradeTemplateInput): string {
  const brand = BRAND_LABEL[input.brand ?? "both"] ?? BRAND_LABEL.both;
  const channel = CHANNEL_LABEL[input.channel ?? "both"] ?? CHANNEL_LABEL.both;
  const purpose = input.purpose.length ? input.purpose.join(", ") : "unspecified";
  const { content, truncated } = clampContent(input.content);

  const dimensionSpec = GRADE_DIMENSIONS.map(
    (d, i) => `${i + 1}. "${d.key}" — ${d.label}: ${d.brief}`,
  ).join("\n");

  const compat =
    input.compatFindings.length > 0
      ? input.compatFindings.map((f) => `- ${f}`).join("\n")
      : "- None detected by the static linter.";

  return `You are a senior email-marketing reviewer grading a marketing email for a fragrance & personal-care company. Grade ONLY what you can see below. Be specific and honest — a mediocre email should not score in the 90s. Reserve 90+ for emails that are genuinely close to send-ready.

## Email under review
- Name: ${input.name}
- Brand: ${brand}
- Audience: ${channel}
- Stated purpose: ${purpose}
- Format: ${input.source === "text" ? "plain-text" : input.source === "html" ? "uploaded HTML" : "block-builder"}
- Subject line: ${input.subject?.trim() ? JSON.stringify(input.subject) : "(empty)"}
- Preview / preheader text: ${input.previewText?.trim() ? JSON.stringify(input.previewText) : "(empty)"}

## Rendered content
${input.source === "text" ? "Plain-text body:" : "Rendered email HTML:"}
"""
${content}${truncated}
"""

## Cross-client compatibility findings (from a static linter — treat as ground truth for deliverability/accessibility)
${compat}

## What the sending pipeline guarantees (do NOT penalize the template for these)
- Every send substitutes all {{merge_field}} tokens with real per-recipient values, including {{unsubscribeUrl}} — a literal token in the content above is correct, not broken.
- Every send carries a working unsubscribe link (the footer shown above ships with the email) plus List-Unsubscribe one-click headers. Never report a missing unsubscribe/opt-out.
- Open/click tracking is applied per message at send time.

## Grade these six dimensions (score each 0–100)
${dimensionSpec}

## Scoring rubric
- 90–100 = excellent, essentially send-ready. 75–89 = good, minor fixes. 60–74 = usable but needs real work. 40–59 = weak. <40 = broken or missing the fundamentals.
- If the subject or preview text is empty, the "subject" dimension must score low and say so.
- The overall_score is your holistic judgment (not a strict average), 0–100. Map it to a letter: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F.

## Issues must include a recommended change
For every issue, don't just name the problem — write the exact change you would make:
- Rewritten copy in full (the actual replacement sentence/subject line, not "make it shorter").
- Specific alt text, specific colors, specific sizes ("set body text to 15px", not "increase font size").
- "auto_fixable" = true only when the fix can be applied by editing this template's subject,
  preview text, or content (copy, alt text, colors, layout, structure). It is false when the fix
  needs something outside the template: new images or assets that don't exist, business decisions
  (pricing, offer terms), sender/domain configuration, or send-time strategy.

## Output — return ONLY this JSON object, no prose, no code fence:
{
  "overall_score": <int 0-100>,
  "letter": "<A|B|C|D|F>",
  "summary": "<one sentence, ≤160 chars, the single most important takeaway>",
  "dimensions": [
    {
      "key": "<one of: content, design, subject, deliverability, accessibility, brand>",
      "score": <int 0-100>,
      "summary": "<one short sentence>",
      "issues": [
        {
          "issue": "<what's wrong, one sentence>",
          "fix": "<the specific recommended change, concrete enough to apply verbatim>",
          "auto_fixable": <true|false>
        }
      ],
      "strengths": ["<what works>", "..."]
    }
    // exactly one object per dimension, all six, in the order listed above
  ]
}`;
}
