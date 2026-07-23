import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type PatchBody = {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  sender_user_id?: string | null;
};

/**
 * GET /api/automations/<id>
 * Returns one automation with its steps (joined to template name/subject) and
 * recent step sends for the activity panel.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [automation, steps, recent, enrollments] = await Promise.all([
    supabaseServer
      .from("automations")
      .select("id, name, description, enabled, trigger_type, trigger_config, sender_user_id, updated_at")
      .eq("id", id)
      .maybeSingle(),
    supabaseServer
      .from("automation_steps")
      .select("id, step_order, template_id, delay_days")
      .eq("automation_id", id)
      .order("step_order", { ascending: true }),
    supabaseServer
      .from("automation_step_sends")
      .select(
        "id, enrollment_id, step_order, status, error_text, sent_at, automation_enrollments!inner(automation_id, customer_name, customer_email)",
      )
      .eq("automation_enrollments.automation_id", id)
      .order("sent_at", { ascending: false })
      .limit(50),
    supabaseServer
      .from("automation_enrollments")
      .select("id, status, next_step_order, next_send_at, customer_name, customer_email, enrolled_at, last_error")
      .eq("automation_id", id)
      .order("enrolled_at", { ascending: false })
      .limit(100),
  ]);

  if (!automation.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch the templates referenced by the steps so the UI can show names.
  const tplIds = Array.from(
    new Set(((steps.data ?? []) as Array<{ template_id: string }>).map((s) => s.template_id)),
  );
  let templates: Array<{ id: string; name: string; subject: string }> = [];
  if (tplIds.length > 0) {
    const { data } = await supabaseServer
      .from("user_email_templates")
      .select("id, name, subject")
      .in("id", tplIds);
    templates = (data as typeof templates | null) ?? [];
  }

  /* Cohort roll-up — the point of batching is comparing one release against
     the next, which needs counts across ALL enrollments, not just the 100 most
     recent the panel above lists. Status-only select keeps it cheap. */
  const { data: cohortRows } = await supabaseServer
    .from("automation_enrollments")
    .select("cohort_label, cohort_number, status")
    .eq("automation_id", id)
    .not("cohort_number", "is", null);

  const cohortMap = new Map<
    number,
    { label: string; number: number; total: number; active: number; completed: number; exited: number }
  >();
  for (const r of (cohortRows ?? []) as Array<{
    cohort_label: string | null;
    cohort_number: number;
    status: string;
  }>) {
    const entry = cohortMap.get(r.cohort_number) ?? {
      label: r.cohort_label ?? `Cohort ${r.cohort_number}`,
      number: r.cohort_number,
      total: 0,
      active: 0,
      completed: 0,
      exited: 0,
    };
    entry.total++;
    if (r.status === "enrolled") entry.active++;
    else if (r.status === "completed") entry.completed++;
    else if (r.status === "exited" || r.status === "unsubscribed") entry.exited++;
    cohortMap.set(r.cohort_number, entry);
  }
  const cohorts = [...cohortMap.values()].sort((a, b) => b.number - a.number);

  return NextResponse.json({
    automation: automation.data,
    steps: steps.data ?? [],
    templates,
    recent: recent.data ?? [],
    enrollments: enrollments.data ?? [],
    cohorts,
  });
}

/**
 * PATCH /api/automations/<id>
 * Partial update — only the fields present in the body are touched.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.trigger_type !== undefined) updates.trigger_type = body.trigger_type;
  if (body.trigger_config !== undefined) updates.trigger_config = body.trigger_config;
  if (body.sender_user_id !== undefined) updates.sender_user_id = body.sender_user_id;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("automations")
    .update(updates)
    .eq("id", id)
    .select("id, name, description, enabled, trigger_type, trigger_config, sender_user_id, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data });
}

/**
 * DELETE /api/automations/<id>
 * Cascades to steps + enrollments + step sends.
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

  const { error } = await supabaseServer.from("automations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
