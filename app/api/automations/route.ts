import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAuthUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";

type CreateBody = {
  name?: string;
  description?: string;
  trigger_type?: "d2c_at_risk" | "wholesale_at_risk" | "manual";
  trigger_config?: Record<string, unknown>;
  sender_user_id?: string | null;
};

/**
 * GET /api/automations
 * Returns all automations + step counts + enrollment counts for the list view.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: autos, error } = await supabaseServer
    .from("automations")
    .select(
      "id, name, description, enabled, trigger_type, trigger_config, sender_user_id, updated_at",
    )
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (autos ?? []).map((a) => (a as { id: string }).id);

  // Step + enrollment counts per automation. Two count() queries, each grouped
  // server-side via the aggregate-by-relation pattern PostgREST supports.
  const stepCounts = new Map<string, number>();
  const enrolledCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: stepsAll } = await supabaseServer
      .from("automation_steps")
      .select("automation_id")
      .in("automation_id", ids);
    for (const s of (stepsAll ?? []) as Array<{ automation_id: string }>) {
      stepCounts.set(s.automation_id, (stepCounts.get(s.automation_id) ?? 0) + 1);
    }
    const { data: enrollAll } = await supabaseServer
      .from("automation_enrollments")
      .select("automation_id, status")
      .in("automation_id", ids);
    for (const e of (enrollAll ?? []) as Array<{ automation_id: string; status: string }>) {
      enrolledCounts.set(
        e.automation_id,
        (enrolledCounts.get(e.automation_id) ?? 0) + 1,
      );
    }
  }

  const result = (autos ?? []).map((a) => {
    const row = a as Record<string, unknown>;
    return {
      ...row,
      step_count: stepCounts.get(row.id as string) ?? 0,
      enrollment_count: enrolledCounts.get(row.id as string) ?? 0,
    };
  });

  return NextResponse.json({ automations: result });
}

/**
 * POST /api/automations
 * Create a new automation. Steps are added separately via the steps endpoint.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.trigger_type) {
    return NextResponse.json({ error: "Trigger type is required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("automations")
    .insert({
      name: body.name.trim(),
      description: body.description ?? null,
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config ?? {},
      sender_user_id: body.sender_user_id ?? null,
    })
    .select("id, name, description, enabled, trigger_type, trigger_config, sender_user_id, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automation: data });
}
