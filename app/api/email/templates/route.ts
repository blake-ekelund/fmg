import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { validateTemplateBody } from "@/lib/email/htmlTemplate";

export const runtime = "nodejs";

/** Uploaded marketing HTML runs large; 2MB is generous and bounds the payload. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const SELECT_COLS =
  "id, name, subject, body, body_format, source_filename, last_used_at, updated_at";

type UpsertBody = {
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
  body_format?: "text" | "html";
  source_filename?: string | null;
};

/**
 * GET /api/email/templates
 * The plain-text template library, shared org-wide, most-recently-updated
 * first. These live in the unified `email_templates` table as source='text'
 * rows; `text_body` is aliased back to `body` so callers (compose modal,
 * automation editor) keep their existing { id, name, subject, body } contract.
 *
 * Pass `?include=designed` to also return the designed templates (block builder
 * + uploaded HTML). Automations use this so a sequence step can send a designed
 * email — the cron runner renders by `source`. The compose modal omits the param
 * so its plain-text picker stays text-only (designed live in its "block" mode).
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

<<<<<<< Updated upstream
  const includeDesigned = new URL(request.url).searchParams.get("include") === "designed";

  let query = supabaseServer
    .from("email_templates")
    .select("id, name, subject, body:text_body, source, last_used_at, updated_at")
=======
  const { data, error } = await supabaseServer
    .from("user_email_templates")
    .select(SELECT_COLS)
>>>>>>> Stashed changes
    .order("updated_at", { ascending: false })
    .limit(200);

  query = includeDesigned
    ? query.in("source", ["text", "blocks", "html"]).eq("type", "email").neq("status", "archived")
    : query.eq("source", "text");

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

/**
 * POST /api/email/templates
 * Create a new template, or update an existing one by id. Body:
 *   { id?: string, name: string, subject: string, body: string }
 */
export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const subject = body.subject ?? "";
  const tplBody = body.body ?? "";
  const bodyFormat = body.body_format === "html" ? "html" : "text";
  const sourceFilename = bodyFormat === "html" ? (body.source_filename ?? null) : null;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!subject.trim() && !tplBody.trim()) {
    return NextResponse.json(
      { error: "Either subject or body must have content" },
      { status: 400 },
    );
  }
  if (new TextEncoder().encode(tplBody).length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Template body exceeds the ${MAX_BODY_BYTES / 1024 / 1024}MB limit.` },
      { status: 400 },
    );
  }

  // Reject bad merge fields at the door. The uploader validates client-side for
  // instant feedback, but this is the gate that actually holds — the same body
  // can arrive from "Save as template" in the compose modal.
  const bodyIssues = validateTemplateBody(tplBody, bodyFormat);
  const subjectIssues = validateTemplateBody(subject, "text");
  if (!bodyIssues.ok || !subjectIssues.ok) {
    return NextResponse.json(
      {
        error: "Template has merge-field problems.",
        issues: [...subjectIssues.issues, ...bodyIssues.issues],
      },
      { status: 400 },
    );
  }

  const fields = {
    name,
    subject,
    body: tplBody,
    body_format: bodyFormat,
    source_filename: sourceFilename,
  };

  // Update path: templates are shared, so any authenticated user can edit any
  // template. Scoped to source='text' so this text-template endpoint can never
  // overwrite a designed (blocks/html) template by id. created_by is untouched.
  if (body.id) {
    const { data, error } = await supabaseServer
<<<<<<< Updated upstream
      .from("email_templates")
      .update({ name, subject, text_body: tplBody, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("source", "text")
      .select("id, name, subject, body:text_body, last_used_at, updated_at")
=======
      .from("user_email_templates")
      .update(fields)
      .eq("id", body.id)
      .select(SELECT_COLS)
>>>>>>> Stashed changes
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data });
  }

  // Insert a new plain-text template into the unified table.
  const { data, error } = await supabaseServer
<<<<<<< Updated upstream
    .from("email_templates")
    .insert({
      name,
      subject,
      type: "email",
      brand: "both",
      channel: "both",
      status: "active",
      source: "text",
      blocks: [],
      text_body: tplBody,
      created_by: user.id,
    })
    .select("id, name, subject, body:text_body, last_used_at, updated_at")
=======
    .from("user_email_templates")
    .insert({ user_id: user.id, ...fields })
    .select(SELECT_COLS)
>>>>>>> Stashed changes
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
