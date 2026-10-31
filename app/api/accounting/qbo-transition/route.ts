import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { STATUSES, SYSTEMS, TASK_TYPES, type QboTask } from "@/lib/qboTransition";

export const runtime = "nodejs";

/**
 * /api/accounting/qbo-transition — the QBO transition checklist (migration
 * 20261101000000). Any internal user can read and edit.
 *
 * GET                          → { ready, tasks }
 * POST { task }                add a task
 * PATCH { id, ...fields }      edit a task
 * DELETE { id }                remove a task
 */

const MISSING = /does not exist|schema cache|relation/i;
const NEEDS_MIGRATION = "The checklist table isn't there yet — run `supabase db push` to apply migration 20261101000000.";

type Row = Record<string, unknown>;

const toTask = (r: Row): QboTask => ({
  id: r.id as string,
  type: r.type as QboTask["type"],
  name: r.name as string,
  description: (r.description as string) ?? null,
  systems: (r.systems as QboTask["systems"]) ?? [],
  owner: (r.owner as string) ?? null,
  helpers: (r.helpers as string) ?? null,
  startDate: (r.start_date as string) ?? null,
  dueDate: (r.due_date as string) ?? null,
  status: r.status as QboTask["status"],
  recommendation: (r.recommendation as string) ?? null,
  mustFix: !!r.must_fix,
  notes: (r.notes as string) ?? null,
  sort: Number(r.sort ?? 0),
  updatedBy: (r.updated_by as string) ?? null,
  updatedAt: (r.updated_at as string) ?? null,
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function taskRow(t: Partial<QboTask>, who: string | null): Row {
  const row: Row = { updated_by: who, updated_at: new Date().toISOString() };
  const s = (v: unknown, max = 300) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
  const d = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
  if ("type" in t) row.type = (TASK_TYPES as readonly string[]).includes(String(t.type)) ? t.type : "Migration";
  if ("name" in t) row.name = s(t.name, 300) ?? "Untitled task";
  if ("description" in t) row.description = s(t.description, 3000);
  if ("systems" in t) row.systems = Array.isArray(t.systems) ? t.systems.filter((x) => (SYSTEMS as readonly string[]).includes(x)) : [];
  if ("owner" in t) row.owner = s(t.owner, 120);
  if ("helpers" in t) row.helpers = s(t.helpers, 300);
  if ("startDate" in t) row.start_date = d(t.startDate);
  if ("dueDate" in t) row.due_date = d(t.dueDate);
  if ("status" in t) {
    row.status = (STATUSES as readonly string[]).includes(String(t.status)) ? t.status : "todo";
    row.completed_at = row.status === "done" ? new Date().toISOString() : null;
  }
  if ("recommendation" in t) row.recommendation = s(t.recommendation, 3000);
  if ("mustFix" in t) row.must_fix = !!t.mustFix;
  if ("notes" in t) row.notes = s(t.notes, 3000);
  if ("sort" in t) row.sort = Number.isFinite(Number(t.sort)) ? Math.round(Number(t.sort)) : 0;
  return row;
}

async function guard(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { user };
}

const fail = (message: string) =>
  MISSING.test(message)
    ? NextResponse.json({ error: NEEDS_MIGRATION, ready: false }, { status: 503 })
    : NextResponse.json({ error: message }, { status: 500 });

export async function GET(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const { data, error } = await supabaseServer.from("qbo_transition_tasks").select("*").order("sort");
  if (error) {
    if (MISSING.test(error.message)) return NextResponse.json({ ready: false, tasks: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ready: true, tasks: (data as Row[]).map(toTask) });
}

export async function POST(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { task?: Partial<QboTask> } | null;
  const task = body?.task ?? {};
  const { data: last } = await supabaseServer.from("qbo_transition_tasks").select("sort").order("sort", { ascending: false }).limit(1);
  const row = taskRow(
    { type: "Migration", name: "New task", systems: [], status: "todo", ...task, sort: task.sort ?? Number(last?.[0]?.sort ?? 0) + 10 },
    g.user.email ?? null,
  );
  const { data, error } = await supabaseServer.from("qbo_transition_tasks").insert(row).select().single();
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, task: toTask(data as Row) });
}

export async function PATCH(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as (Partial<QboTask> & { id?: string }) | null;
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { id: _omit, ...fields } = body ?? {};
  void _omit;
  const { data, error } = await supabaseServer
    .from("qbo_transition_tasks")
    .update(taskRow(fields, g.user.email ?? null))
    .eq("id", id)
    .select()
    .single();
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, task: toTask(data as Row) });
}

export async function DELETE(request: Request) {
  const g = await guard(request);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { error } = await supabaseServer.from("qbo_transition_tasks").delete().eq("id", id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
}
