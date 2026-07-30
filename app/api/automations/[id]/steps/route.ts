import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type AddStepBody = {
  template_id?: string;
  delay_days?: number;
  /** Pin the step to an exact date (YYYY-MM-DD). Overrides delay_days. */
  send_date?: string | null;
  /** Optional explicit order; defaults to (max existing order + 1). */
  step_order?: number;
};

/** Accept only a bare calendar date (YYYY-MM-DD), or null to clear the pin. */
function normalizeSendDate(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

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

  /* template_id is optional — a step can be added before its email exists
     ("Add later"). The editor blocks turning the automation on until every
     step has one, and the cron runner skips template-less steps. */
  const delayDays = body.delay_days ?? 0;
  if (delayDays < 0) {
    return NextResponse.json({ error: "delay_days must be >= 0" }, { status: 400 });
  }

  const sendDate = normalizeSendDate(body.send_date);
  if (sendDate === undefined && body.send_date !== undefined) {
    return NextResponse.json(
      { error: "send_date must be YYYY-MM-DD or null" },
      { status: 400 },
    );
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
      template_id: body.template_id ?? null,
      delay_days: delayDays,
      send_date: sendDate ?? null,
    })
    .select("id, step_order, template_id, delay_days, send_date")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ step: data });
}
