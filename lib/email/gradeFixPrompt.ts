/**
 * Prompt builder for POST /api/email/templates/grade/fix — the "Fix this"
 * button on a graded issue. Given the template's current state and ONE issue
 * (with the grader's recommended change), the model returns updated template
 * fields as strict JSON. Kept separate from the route (mirroring gradePrompt /
 * generatePrompt) so the contract is easy to read and tune.
 *
 * The model only returns the fields it changed. Blocks templates speak the
 * same block vocabulary the generator uses (BLOCK_VOCAB), and the route runs
 * the result through normalizeBlocks — so this prompt optimises for a good,
 * minimal edit, not for schema safety.
 */

import { BLOCK_VOCAB } from "./generatePrompt";

const BRAND_VOICE: Record<string, string> = {
  ni: "Natural Inspirations — warm, spa-inspired, luxurious but approachable. Nurturing and elegant, never pretentious.",
  sassy: "Sassy — bold, playful, confident, best-friend energy with a wink. Casual, upbeat.",
  both: "Brand-neutral (serves both Natural Inspirations and Sassy).",
};

export type GradeFixInput = {
  templateName: string;
  brand: string | null;
  source: "blocks" | "html" | "text";
  subject: string | null;
  previewText: string | null;
  /** Current content in the template's native representation:
      blocks → the blocks JSON; html → raw_html; text → text_body. */
  content: string;
  dimensionLabel: string;
  issue: string;
  recommendedFix: string;
};

export function buildGradeFixPrompt(input: GradeFixInput): string {
  const voice = BRAND_VOICE[input.brand ?? "both"] ?? BRAND_VOICE.both;

  const contentSpec =
    input.source === "blocks"
      ? `The template is built from our block JSON (vocabulary below). If your fix changes the content, return the COMPLETE updated blocks array as "blocks" — every block, not just the ones you touched. Keep every block's "id" unchanged so the editor's history survives; only add new ids for blocks you add.\n\n${BLOCK_VOCAB}`
      : input.source === "html"
        ? `The template is a raw HTML email document. If your fix changes the content, return the COMPLETE updated HTML document as "raw_html". Preserve the document's overall structure, inline-style approach, and any {{merge_fields}} — change only what the fix requires.`
        : `The template is a plain-text email body. If your fix changes the content, return the COMPLETE updated body as "text_body". Preserve any {{merge_fields}}.`;

  return `You are an expert email marketer applying ONE specific fix to an email template. Make the recommended change faithfully and completely — but change nothing else. This is a surgical edit, not a redesign.

Brand voice: ${voice}

## Template: ${input.templateName}
- Subject line: ${input.subject?.trim() ? JSON.stringify(input.subject) : "(empty)"}
- Preview text: ${input.previewText?.trim() ? JSON.stringify(input.previewText) : "(empty)"}

## Current content
"""
${input.content}
"""

## The issue to fix (dimension: ${input.dimensionLabel})
Issue: ${input.issue}
Recommended change: ${input.recommendedFix}

## Rules
- Apply the recommended change. Where it specifies exact copy, use it; where it describes a change, write it in the brand voice.
- Touch ONLY what the fix requires. Do not rewrite unrelated copy, restyle unrelated blocks, or "improve" anything else.
- Keep all {{merge_field}} tokens intact unless the fix is specifically about them.
- ${contentSpec}

## Output — return ONLY this JSON object, no prose, no code fence. Include a field ONLY if you changed it:
{
  "subject": "<updated subject line>",
  "preview_text": "<updated preview text>",
  ${input.source === "blocks" ? `"blocks": [ ...complete updated blocks array... ],` : input.source === "html" ? `"raw_html": "<complete updated HTML document>",` : `"text_body": "<complete updated body>",`}
  "change_note": "<one sentence describing exactly what you changed — always include this>"
}`;
}
