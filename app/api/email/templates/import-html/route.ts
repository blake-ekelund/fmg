import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";
// Cap the input so a giant pasted document can't run up the token bill; real
// marketing emails sit well under this.
const MAX_HTML_CHARS = 60_000;

/**
 * The block vocabulary the editor understands. Kept in sync with
 * components/templates/types.ts (EmailBlock) and the block renderer. Claude must
 * emit only these shapes so the result opens cleanly in the builder.
 */
const BLOCK_SCHEMA = `
1. header:  {"id","type":"header","logoUrl":"","companyName":"...","bgColor":"#1a5632","textColor":"#ffffff","padding":20}
2. hero:    {"id","type":"hero","imageUrl":"","heading":"...","subheading":"...","buttonText":"...","buttonUrl":"https://...","overlay":true,"textColor":"#ffffff","padding":0}
3. text:    {"id","type":"text","html":"<p>...</p>","fontSize":15,"fontFamily":"sans","textAlign":"left","textColor":"#374151","bgColor":"#ffffff","padding":20}
4. image:   {"id","type":"image","src":"https://...","alt":"...","width":"full","align":"center","linkUrl":"","borderRadius":0,"padding":10}
5. button:  {"id","type":"button","text":"...","url":"https://...","bgColor":"#1a5632","textColor":"#ffffff","align":"center","borderRadius":8,"fontSize":16,"padding":20}
6. divider: {"id","type":"divider","color":"#e5e7eb","thickness":1,"style":"solid","padding":10}
7. spacer:  {"id","type":"spacer","height":24}
8. columns: {"id","type":"columns","columns":2,"gap":16,"items":[{"heading":"...","text":"...","imageUrl":""}],"padding":20}
9. product: {"id","type":"product","imageUrl":"","name":"...","description":"...","price":"$XX.XX","buttonText":"Shop Now","buttonUrl":"https://...","bgColor":"#ffffff","padding":20}
10. social: {"id","type":"social","align":"center","facebook":"","instagram":"","tiktok":"","website":"","padding":20}
`.trim();

function buildPrompt(html: string): string {
  return `You are converting an existing HTML marketing email into a structured block layout for an email builder.

Here is the email's HTML:
"""
${html}
"""

Rebuild it as an ordered array of blocks using ONLY these shapes:
${BLOCK_SCHEMA}

Rules:
- Preserve the email's content, copy, order, and links faithfully. This is a best-effort reconstruction, not a pixel-perfect copy — favour clean, editable blocks over exotic layout.
- Keep real image URLs in image/hero "src"/"imageUrl". Keep real link URLs in button/hero "buttonUrl" and image "linkUrl".
- Put paragraphs, headings and lists into text blocks using simple inline HTML (<p>, <strong>, <em>, <br>, <ul>, <li>, <h2>).
- Turn call-to-action links styled as buttons into button blocks.
- A logo/masthead at the top becomes a header block; a large banner image with a headline becomes a hero block.
- Give every block a unique short "id" (e.g. "blk-1", "blk-2").
- Leave {{merge_fields}} exactly as they appear.
- Do NOT invent content that isn't in the source.

Also derive a "subject" and short "preview_text" from the email (use existing ones if present, otherwise summarise).

Return ONLY valid JSON, no prose, in exactly this shape:
{"subject":"...","preview_text":"...","blocks":[ ... ]}`;
}

type ImportedBlock = { id?: unknown; type?: unknown; [k: string]: unknown };

const VALID_TYPES = new Set([
  "header", "hero", "text", "image", "button",
  "divider", "spacer", "columns", "product", "social",
]);

/**
 * POST /api/email/templates/import-html
 * Body: { html: string }
 * Returns: { subject, preview_text, blocks } — a best-effort block reconstruction
 * of the uploaded HTML, ready to seed a new blocks template.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "HTML import isn't configured (ANTHROPIC_API_KEY is missing on the server)." },
      { status: 400 },
    );
  }

  let html = "";
  try {
    const parsed = (await request.json()) as { html?: string };
    html = (parsed.html ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!html) {
    return NextResponse.json({ error: "That file looks empty — nothing to import." }, { status: 400 });
  }
  const truncated = html.length > MAX_HTML_CHARS;
  if (truncated) html = html.slice(0, MAX_HTML_CHARS);

  let text: string;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: buildPrompt(html) }],
    });
    text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI import failed." },
      { status: 502 },
    );
  }

  // Claude sometimes wraps JSON in prose or a code fence — extract the object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Could not read the imported layout. Try again." }, { status: 502 });
  }
  let parsed: { subject?: string; preview_text?: string; blocks?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "The imported layout wasn't valid. Try again." }, { status: 502 });
  }

  // Keep only well-formed blocks of a known type, and guarantee each has an id.
  const rawBlocks = Array.isArray(parsed.blocks) ? (parsed.blocks as ImportedBlock[]) : [];
  const blocks = rawBlocks
    .filter((b) => b && typeof b.type === "string" && VALID_TYPES.has(b.type))
    .map((b, i) => ({
      ...b,
      id: typeof b.id === "string" && b.id ? b.id : `blk-${i + 1}`,
    }));

  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "Couldn't turn that HTML into editable blocks. It may be too complex — try a simpler file." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    subject: typeof parsed.subject === "string" ? parsed.subject : "",
    preview_text: typeof parsed.preview_text === "string" ? parsed.preview_text : "",
    blocks,
    truncated,
  });
}
