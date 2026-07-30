import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

/**
 * DELETE /api/email/templates/<id>[?force=true]
 *
 * Templates are shared org-wide, so any authenticated user can delete any row.
 * A template used by an automation step is protected by an ON DELETE RESTRICT
 * foreign key, so a plain delete fails. Instead of a raw DB error we:
 *   - without force: return 409 with the automations that use it, so the UI can
 *     warn the user before they break a live sequence;
 *   - with force=true: detach it from those steps (template_id → null, i.e.
 *     "add later") and then delete.
 *
 * 204 on success; 404 if the row doesn't exist; 409 when in use and not forced.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const force = new URL(request.url).searchParams.get("force") === "true";

  // Which automation steps (and their automations) reference this template?
  const { data: steps } = await supabaseServer
    .from("automation_steps")
    .select("id, automations(name)")
    .eq("template_id", id);

  const usedBy = Array.from(
    new Set(
      ((steps ?? []) as Array<{ automations: { name: string | null } | { name: string | null }[] | null }>)
        .flatMap((s) => (Array.isArray(s.automations) ? s.automations : s.automations ? [s.automations] : []))
        .map((a) => a?.name)
        .filter((n): n is string => !!n),
    ),
  );

  if (steps && steps.length > 0) {
    if (!force) {
      return NextResponse.json(
        {
          error: "This email is used by an automation.",
          in_use: true,
          automations: usedBy,
          step_count: steps.length,
        },
        { status: 409 },
      );
    }
    // Detach from every step so the RESTRICT constraint releases; those steps
    // become "add later" until the user picks a new email.
    const { error: detachErr } = await supabaseServer
      .from("automation_steps")
      .update({ template_id: null })
      .eq("template_id", id);
    if (detachErr) return NextResponse.json({ error: detachErr.message }, { status: 500 });
  }

  const { data, error } = await supabaseServer
    .from("email_templates")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/email/templates/<id>/use
 * Convenience endpoint: bumps last_used_at when a template is loaded into
 * the compose modal. Optional from the UI's perspective — the list endpoint
 * still works without it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await supabaseServer
    .from("email_templates")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source", "text");

  return NextResponse.json({ ok: true });
}
