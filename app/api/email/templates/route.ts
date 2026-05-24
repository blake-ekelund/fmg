import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type UpsertBody = {
  id?: string;
  name?: string;
  subject?: string;
  body?: string;
};

/**
 * GET /api/email/templates
 * Returns the current user's templates, most-recently-updated first.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("user_email_templates")
    .select("id, name, subject, body, last_used_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);

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
  const user = await getAuthUser(request);
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

  // Update path: only allow updating a row that belongs to the caller.
  if (body.id) {
    const { data, error } = await supabaseServer
      .from("user_email_templates")
      .update({ name, subject, body: tplBody })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select("id, name, subject, body, last_used_at, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data });
  }

  // Insert.
  const { data, error } = await supabaseServer
    .from("user_email_templates")
    .insert({ user_id: user.id, name, subject, body: tplBody })
    .select("id, name, subject, body, last_used_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
