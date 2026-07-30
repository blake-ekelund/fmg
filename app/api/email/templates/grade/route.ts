import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { renderBlocksToEmailHtml } from "@/lib/email/renderBlocks";
import { renderRawHtmlEmail } from "@/lib/email/rawHtml";
import { renderTextEmail } from "@/lib/email/renderText";
import { lintEmailHtml } from "@/lib/email/clientCompat";
import { buildGradePrompt, GRADE_DIMENSIONS, type GradeDimensionKey } from "@/lib/email/gradePrompt";
import { toPurposeArray } from "@/components/templates/types";
import type { EmailBlock } from "@/components/templates/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "claude-opus-4-8";
// Bound cost/time — grade the N most-recently-updated templates per run.
const MAX_TEMPLATES_PER_RUN = 60;
const GRADE_CONCURRENCY = 4;

const DIM_KEYS = new Set<string>(GRADE_DIMENSIONS.map((d) => d.key));
const DIM_LABEL = new Map(GRADE_DIMENSIONS.map((d) => [d.key, d.label]));

type TemplateRow = {
  id: string;
  name: string;
  subject: string | null;
  preview_text: string | null;
  source: "blocks" | "html" | "text";
  blocks: unknown;
  raw_html: string | null;
  text_body: string | null;
  brand: string | null;
  channel: string | null;
  purpose: unknown;
  updated_at: string;
};

/** One graded issue: the problem plus the concrete change that would fix it.
    auto_fixable gates the "Fix this" button — true only when the fix is an
    edit to this template's own subject/preview/content. */
type GradedIssue = {
  issue: string;
  fix: string;
  auto_fixable: boolean;
};

type GradedDimension = {
  key: GradeDimensionKey;
  label: string;
  score: number;
  summary: string;
  issues: GradedIssue[];
  strengths: string[];
};

type GradeRow = {
  template_id: string;
  overall_score: number;
  letter: string;
  summary: string | null;
  dimensions: GradedDimension[];
  model: string;
  template_updated_at: string;
  graded_by: string;
  graded_at: string;
};

function letterFor(score: number): string {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

function clampScore(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function toStringList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim().slice(0, 400))
    .slice(0, cap);
}

/** Coerce the model's issues array. Tolerates plain strings (the pre-fix
    grade format) by wrapping them as non-fixable issues with no fix text. */
function toIssueList(v: unknown, cap: number): GradedIssue[] {
  if (!Array.isArray(v)) return [];
  const out: GradedIssue[] = [];
  for (const x of v) {
    if (out.length >= cap) break;
    if (typeof x === "string" && x.trim()) {
      out.push({ issue: x.trim().slice(0, 400), fix: "", auto_fixable: false });
    } else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const issue = typeof o.issue === "string" ? o.issue.trim() : "";
      if (!issue) continue;
      out.push({
        issue: issue.slice(0, 400),
        fix: typeof o.fix === "string" ? o.fix.trim().slice(0, 600) : "",
        auto_fixable: o.auto_fixable === true,
      });
    }
  }
  return out;
}

/** Rendered content (for the prompt) + HTML (for the linter), by source. */
function renderForGrading(t: TemplateRow): { content: string; html: string } {
  const previewText = t.preview_text ?? undefined;
  if (t.source === "blocks") {
    const html = renderBlocksToEmailHtml(
      Array.isArray(t.blocks) ? (t.blocks as EmailBlock[]) : [],
      { previewText },
    );
    return { content: html, html };
  }
  if (t.source === "html") {
    const html = renderRawHtmlEmail(t.raw_html ?? "", { previewText });
    return { content: html, html };
  }
  // Plain text: grade the actual body, but lint the rendered HTML.
  const html = renderTextEmail(t.text_body ?? "", { previewText });
  return { content: t.text_body ?? "", html };
}

async function gradeOne(
  client: Anthropic,
  t: TemplateRow,
  userId: string,
  nowIso: string,
): Promise<GradeRow> {
  const { content, html } = renderForGrading(t);
  const compatFindings = lintEmailHtml(html).map(
    (f) => `[${f.severity}] ${f.title} — ${f.detail}`,
  );

  const prompt = buildGradePrompt({
    name: t.name,
    purpose: toPurposeArray(t.purpose),
    brand: t.brand,
    channel: t.channel,
    subject: t.subject,
    previewText: t.preview_text,
    source: t.source,
    content,
    compatFindings,
  });

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Grader returned no JSON");
  const parsed = JSON.parse(match[0]) as {
    overall_score?: unknown;
    summary?: unknown;
    dimensions?: unknown;
  };

  const overall = clampScore(parsed.overall_score);
  const rawDims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const d of rawDims) {
    if (d && typeof d === "object" && DIM_KEYS.has((d as { key?: string }).key ?? "")) {
      byKey.set((d as { key: string }).key, d as Record<string, unknown>);
    }
  }

  // Emit exactly the six dimensions, in canonical order, tolerating omissions.
  const dimensions: GradedDimension[] = GRADE_DIMENSIONS.map((def) => {
    const d = byKey.get(def.key) ?? {};
    return {
      key: def.key,
      label: DIM_LABEL.get(def.key) ?? def.label,
      score: clampScore(d.score),
      summary: typeof d.summary === "string" ? d.summary.slice(0, 400) : "",
      issues: toIssueList(d.issues, 6),
      strengths: toStringList(d.strengths, 6),
    };
  });

  return {
    template_id: t.id,
    overall_score: overall,
    letter: letterFor(overall),
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 400) : null,
    dimensions,
    model: MODEL,
    template_updated_at: t.updated_at,
    graded_by: userId,
    graded_at: nowIso,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<{ item: T; result?: R; error?: string }>> {
  const out: Array<{ item: T; result?: R; error?: string }> = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = { item: items[i], result: await worker(items[i]) };
      } catch (e) {
        out[i] = { item: items[i], error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}

/**
 * GET /api/email/templates/grade
 * Current grade per template, for the library. Keyed by template_id.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let { data, error } = await supabaseServer
    .from("email_template_grades")
    .select("template_id, overall_score, letter, summary, dimensions, fixes, template_updated_at, graded_at");
  if (error && /fixes/i.test(error.message)) {
    // `fixes` column not migrated yet — grades still work, just without
    // applied-fix tracking.
    ({ data, error } = await supabaseServer
      .from("email_template_grades")
      .select("template_id, overall_score, letter, summary, dimensions, template_updated_at, graded_at"));
  }
  if (error) {
    // Table not migrated yet → behave as "no grades" rather than 500ing the page.
    return NextResponse.json({ grades: {} });
  }

  const grades: Record<string, unknown> = {};
  for (const g of data ?? []) grades[(g as { template_id: string }).template_id] = g;
  return NextResponse.json({ grades });
}

/**
 * POST /api/email/templates/grade
 * Grade every email template (most-recently-updated first, capped), upserting
 * one current grade per template. Returns the grades it wrote.
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Grading isn't configured (ANTHROPIC_API_KEY is missing on the server)." },
      { status: 400 },
    );
  }

  const { data: rows, error } = await supabaseServer
    .from("email_templates")
    .select("id, name, subject, preview_text, source, blocks, raw_html, text_body, brand, channel, purpose, updated_at")
    .eq("type", "email")
    .neq("status", "archived")
    .in("source", ["blocks", "html", "text"])
    .order("updated_at", { ascending: false })
    .limit(MAX_TEMPLATES_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = (rows as TemplateRow[] | null) ?? [];
  if (templates.length === 0) {
    return NextResponse.json({ graded: 0, failed: 0, grades: {}, errors: [] });
  }

  const client = new Anthropic();
  const nowIso = new Date().toISOString();
  const outcomes = await runWithConcurrency(templates, GRADE_CONCURRENCY, (t) =>
    gradeOne(client, t, user.id, nowIso),
  );

  const gradeRows = outcomes
    .map((o) => o.result)
    .filter((r): r is GradeRow => !!r);
  const errors = outcomes
    .filter((o) => o.error)
    .map((o) => `${o.item.name}: ${o.error}`);

  if (gradeRows.length > 0) {
    // A fresh grade replaces the issue list, so applied-fix tracking resets too.
    let { error: upsertErr } = await supabaseServer
      .from("email_template_grades")
      .upsert(gradeRows.map((g) => ({ ...g, fixes: [] })), { onConflict: "template_id" });
    if (upsertErr && /fixes/i.test(upsertErr.message)) {
      ({ error: upsertErr } = await supabaseServer
        .from("email_template_grades")
        .upsert(gradeRows, { onConflict: "template_id" }));
    }
    if (upsertErr) {
      return NextResponse.json(
        { error: `Grades computed but couldn't be saved: ${upsertErr.message}` },
        { status: 500 },
      );
    }
  }

  const grades: Record<string, GradeRow> = {};
  for (const g of gradeRows) grades[g.template_id] = g;

  return NextResponse.json({
    graded: gradeRows.length,
    failed: errors.length,
    capped: templates.length === MAX_TEMPLATES_PER_RUN,
    grades,
    errors,
  });
}
