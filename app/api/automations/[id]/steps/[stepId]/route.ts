import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type PatchBody = {
  template_id?: string;
  delay_days?: number;
  step_order?: number;
};

/**
 * PATCH /api/automations/<id>/steps/<stepId>
 * Edit one step in place. Used by the inline editor in the UI.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; stepId: string }> },
) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, stepId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(stepId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.template_id !== undefined) updates.template_id = body.template_id;
  if (body.delay_days !== undefined) {
    if (body.delay_days < 0) {
      return NextResponse.json({ error: "delay_days must be >= 0" }, { status: 400 });
    }
    updates.delay_days = body.delay_days;
  }
  if (body.step_order !== undefined) updates.step_order = body.step_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("automation_steps")
    .update(updates)
    .eq("id", stepId)
    .eq("automation_id", id)
    .select("id, step_order, template_id, delay_days")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ step: data });
}

/**
 * DELETE /api/automations/<id>/steps/<stepId>
 * Remove a step. Subsequent steps keep their order (no auto-reflow) so
 * enrollments mid-sequence don't suddenly jump.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; stepId: string }> },
) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, stepId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(stepId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("automation_steps")
    .delete()
    .eq("id", stepId)
    .eq("automation_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
