import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type UpsertBody = {
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
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

  const includeDesigned = new URL(request.url).searchParams.get("include") === "designed";

  let query = supabaseServer
    .from("email_templates")
    .select("id, name, subject, body:text_body, source, last_used_at, updated_at")
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
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!subject.trim() && !tplBody.trim()) {
    return NextResponse.json(
      { error: "Either subject or body must have content" },
      { status: 400 },
    );
  }

  // Update path: templates are shared, so any authenticated user can edit any
  // template. Scoped to source='text' so this text-template endpoint can never
  // overwrite a designed (blocks/html) template by id. created_by is untouched.
  if (body.id) {
    const { data, error } = await supabaseServer
      .from("email_templates")
      .update({ name, subject, text_body: tplBody, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("source", "text")
      .select("id, name, subject, body:text_body, last_used_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data });
  }

  // Insert a new plain-text template into the unified table.
  const { data, error } = await supabaseServer
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
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
