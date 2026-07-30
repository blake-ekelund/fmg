import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildGradeFixPrompt } from "@/lib/email/gradeFixPrompt";
import { normalizeBlocks } from "@/lib/email/normalizeBlocks";
import type { EmailBlock } from "@/components/templates/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-opus-5";
/** Trim what we show the model so one huge template can't blow the budget. */
const MAX_CONTENT_CHARS = 40000;

type FixRequest = {
  template_id: string;
  dimension_key: string;
  dimension_label?: string;
  issue: string;
  fix: string;
};

/** One applied fix, stored on email_template_grades.fixes. */
type FixRecord = {
  dimension: string;
  issue: string;
  note: string;
  fixed_at: string;
  fixed_by: string;
};

/**
 * POST /api/email/templates/grade/fix
 *
 * Apply ONE graded issue's recommended change to the template. The model gets
 * the template's native representation (blocks JSON / raw HTML / text) plus
 * the single issue, returns only the fields it changed, and we validate before
 * saving — blocks go through normalizeBlocks, same as the AI generator, so a
 * malformed edit can never be stored.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Fixing isn't configured (ANTHROPIC_API_KEY is missing on the server)." },
      { status: 400 },
    );
  }

  let body: FixRequest;
  try {
    body = (await request.json()) as FixRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.template_id || !body.issue?.trim() || !body.fix?.trim()) {
    return NextResponse.json(
      { error: "template_id, issue, and fix are required." },
      { status: 400 },
    );
  }

  const { data: tpl, error: tplErr } = await supabaseServer
    .from("email_templates")
    .select("id, name, subject, preview_text, source, blocks, raw_html, text_body, brand")
    .eq("id", body.template_id)
    .maybeSingle();
  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });
  if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const source = tpl.source as "blocks" | "html" | "text";
  const content =
    source === "blocks"
      ? JSON.stringify(tpl.blocks ?? [], null, 1)
      : source === "html"
        ? ((tpl.raw_html as string | null) ?? "")
        : ((tpl.text_body as string | null) ?? "");

  const prompt = buildGradeFixPrompt({
    templateName: (tpl.name as string) || "Untitled",
    brand: (tpl.brand as string | null) ?? null,
    source,
    subject: (tpl.subject as string | null) ?? null,
    previewText: (tpl.preview_text as string | null) ?? null,
    content: content.slice(0, MAX_CONTENT_CHARS),
    dimensionLabel: body.dimension_label?.trim() || body.dimension_key || "general",
    issue: body.issue.trim(),
    recommendedFix: body.fix.trim(),
  });

  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "The AI declined to apply this fix. Edit the template manually instead." },
      { status: 422 },
    );
  }

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "The AI returned no usable change." }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "The AI's change couldn't be parsed." }, { status: 502 });
  }

  // ── Validate + collect the update ──
  const update: Record<string, unknown> = {};
  const changed: string[] = [];

  if (typeof parsed.subject === "string" && parsed.subject.trim()) {
    update.subject = parsed.subject.trim().slice(0, 300);
    changed.push("subject");
  }
  if (typeof parsed.preview_text === "string" && parsed.preview_text.trim()) {
    update.preview_text = parsed.preview_text.trim().slice(0, 300);
    changed.push("preview text");
  }
  if (source === "blocks" && Array.isArray(parsed.blocks)) {
    const blocks: EmailBlock[] = normalizeBlocks(parsed.blocks);
    if (blocks.length === 0) {
      return NextResponse.json(
        { error: "The AI's edit produced no valid blocks — nothing was changed." },
        { status: 422 },
      );
    }
    update.blocks = blocks;
    changed.push("content");
  } else if (source === "html" && typeof parsed.raw_html === "string" && parsed.raw_html.includes("<")) {
    update.raw_html = parsed.raw_html;
    changed.push("content");
  } else if (source === "text" && typeof parsed.text_body === "string" && parsed.text_body.trim()) {
    update.text_body = parsed.text_body;
    changed.push("content");
  }

  if (changed.length === 0) {
    return NextResponse.json(
      { error: "The AI made no applicable change. This issue likely needs a manual edit." },
      { status: 422 },
    );
  }

  const changeNote =
    typeof parsed.change_note === "string" && parsed.change_note.trim()
      ? parsed.change_note.trim().slice(0, 400)
      : `Updated ${changed.join(", ")}.`;

  update.updated_at = new Date().toISOString();
  const { error: saveErr } = await supabaseServer
    .from("email_templates")
    .update(update)
    .eq("id", body.template_id);
  if (saveErr) {
    return NextResponse.json(
      { error: `Fix computed but couldn't be saved: ${saveErr.message}` },
      { status: 500 },
    );
  }

  // ── Record the fix on the grade row (best-effort — the template edit is
  //    already saved; a missing `fixes` column must not fail the request) ──
  const record: FixRecord = {
    dimension: body.dimension_key,
    issue: body.issue.trim(),
    note: changeNote,
    fixed_at: new Date().toISOString(),
    fixed_by: user.id,
  };
  let fixes: FixRecord[] = [record];
  try {
    const { data: gradeRow } = await supabaseServer
      .from("email_template_grades")
      .select("fixes")
      .eq("template_id", body.template_id)
      .maybeSingle();
    const existing = Array.isArray(gradeRow?.fixes) ? (gradeRow.fixes as FixRecord[]) : [];
    fixes = [...existing, record];
    await supabaseServer
      .from("email_template_grades")
      .update({ fixes })
      .eq("template_id", body.template_id);
  } catch {
    /* grade row absent or fixes column not migrated — the fix itself stands */
  }

  return NextResponse.json({
    applied: true,
    changed,
    change_note: changeNote,
    fixes,
  });
}
