import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type AddStepBody = {
  template_id?: string;
  delay_days?: number;
  /** Optional explicit order; defaults to (max existing order + 1). */
  step_order?: number;
};

/**
 * POST /api/automations/<id>/steps
 * Append a new step to the automation. Returns the inserted row.
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

  let body: AddStepBody;
  try {
    body = (await request.json()) as AddStepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.template_id) {
    return NextResponse.json({ error: "template_id is required" }, { status: 400 });
  }
  const delayDays = body.delay_days ?? 0;
  if (delayDays < 0) {
    return NextResponse.json({ error: "delay_days must be >= 0" }, { status: 400 });
  }

  // Default order = max + 1.
  let stepOrder = body.step_order;
  if (stepOrder == null) {
    const { data: maxRow } = await supabaseServer
      .from("automation_steps")
      .select("step_order")
      .eq("automation_id", id)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    stepOrder = ((maxRow?.step_order as number | null) ?? 0) + 1;
  }

  const { data, error } = await supabaseServer
    .from("automation_steps")
    .insert({
      automation_id: id,
      step_order: stepOrder,
      template_id: body.template_id,
      delay_days: delayDays,
    })
    .select("id, step_order, template_id, delay_days")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ step: data });
}
