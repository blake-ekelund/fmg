import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  BUSINESS_UNITS,
  STATUSES,
  draftProposedChart,
  type CurrentAccount,
  type ProposedAccount,
} from "@/lib/coa";

export const runtime = "nodejs";

/**
 * /api/accounting/coa — the chart-of-accounts workspace (migration
 * 20261030000000). Reading needs any internal user; changing needs owner or
 * admin (Julie and Blake).
 *
 * GET                                  → { ready, current, proposed }
 * POST { action: "import", accounts, fileName }   replace the current chart
 * POST { action: "draft", replace? }   build the proposed chart from current
 * POST { action: "add", account }      add a proposed account
 * PATCH { id, ...fields }              edit a proposed account
 * DELETE { id }                        remove a proposed account
 */

const MISSING = /does not exist|schema cache|relation/i;
const NEEDS_MIGRATION = "The chart of accounts table isn't there yet — run `supabase db push` to apply migration 20261030000000.";

type Row = Record<string, unknown>;

const toCurrent = (r: Row) => ({
  id: r.id,
  number: r.number,
  name: r.name,
  parent: r.parent,
  fullName: r.full_name,
  type: r.type,
  balance: r.balance === null ? null : Number(r.balance),
  description: r.description,
  fishbowlDefault: r.fishbowl_default,
});

const toProposed = (r: Row) => ({
  id: r.id,
  number: r.number,
  name: r.name,
  parent: r.parent,
  type: r.type,
  detailType: r.detail_type,
  businessUnit: r.business_unit,
  status: r.status,
  mapsFrom: r.maps_from ?? [],
  description: r.description,
  notes: r.notes,
  fishbowlDefault: r.fishbowl_default,
  sort: r.sort,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

function proposedRow(p: Partial<ProposedAccount>, who: string | null): Row {
  const row: Row = { chart: "proposed", updated_by: who, updated_at: new Date().toISOString() };
  const s = (v: unknown, max = 300) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
  if ("number" in p) row.number = s(p.number, 20);
  if ("name" in p) row.name = s(p.name, 200) ?? "Untitled account";
  if ("parent" in p) row.parent = s(p.parent, 300);
  if ("type" in p) row.type = s(p.type, 60) ?? "Expenses";
  if ("detailType" in p) row.detail_type = s(p.detailType, 80);
  if ("businessUnit" in p) row.business_unit = (BUSINESS_UNITS as readonly string[]).includes(String(p.businessUnit)) ? p.businessUnit : null;
  if ("status" in p) row.status = (STATUSES as readonly string[]).includes(String(p.status)) ? p.status : "keep";
  if ("mapsFrom" in p) row.maps_from = Array.isArray(p.mapsFrom) ? p.mapsFrom.map((x) => String(x).slice(0, 300)).slice(0, 50) : [];
  if ("description" in p) row.description = s(p.description, 1000);
  if ("notes" in p) row.notes = s(p.notes, 2000);
  if ("fishbowlDefault" in p) row.fishbowl_default = !!p.fishbowlDefault;
  if ("sort" in p) row.sort = Number.isFinite(Number(p.sort)) ? Math.round(Number(p.sort)) : 0;
  return row;
}

async function guard(request: Request, write: boolean) {
  const user = await requireInternalUser(request);
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (write && user.access !== "owner" && user.access !== "admin") {
    return { error: NextResponse.json({ error: "Only owners and admins can change the chart of accounts." }, { status: 403 }) };
  }
  return { user };
}

const fail = (message: string) =>
  MISSING.test(message)
    ? NextResponse.json({ error: NEEDS_MIGRATION, ready: false }, { status: 503 })
    : NextResponse.json({ error: message }, { status: 500 });

export async function GET(request: Request) {
  const g = await guard(request, false);
  if (g.error) return g.error;
  const { data, error } = await supabaseServer.from("coa_accounts").select("*").order("chart").order("sort");
  if (error) {
    if (MISSING.test(error.message)) return NextResponse.json({ ready: false, current: [], proposed: [], importedFrom: null });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];
  const current = rows.filter((r) => r.chart === "current");
  return NextResponse.json({
    ready: true,
    current: current.map(toCurrent),
    proposed: rows.filter((r) => r.chart === "proposed").map(toProposed),
    importedFrom: current[0] ? { file: current[0].source, at: current[0].created_at } : null,
  });
}

export async function POST(request: Request) {
  const g = await guard(request, true);
  if (g.error) return g.error;
  const who = g.user.email ?? null;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === "import") {
    const accounts = Array.isArray(body?.accounts) ? (body.accounts as CurrentAccount[]) : [];
    if (accounts.length === 0 || accounts.length > 2000) {
      return NextResponse.json({ error: "Send between 1 and 2,000 accounts." }, { status: 400 });
    }
    const fileName = String(body?.fileName ?? "").slice(0, 200) || null;
    const del = await supabaseServer.from("coa_accounts").delete().eq("chart", "current");
    if (del.error) return fail(del.error.message);
    const rows = accounts.map((a, i) => ({
      chart: "current",
      number: a.number ? String(a.number).slice(0, 20) : null,
      name: String(a.name ?? "").slice(0, 200) || "(no name)",
      parent: a.parent ? String(a.parent).slice(0, 300) : null,
      full_name: String(a.fullName ?? a.name ?? "").slice(0, 300),
      type: String(a.type ?? "").slice(0, 60) || "Unknown",
      balance: Number.isFinite(Number(a.balance)) && a.balance !== null ? Number(a.balance) : null,
      description: a.description ? String(a.description).slice(0, 1000) : null,
      fishbowl_default: !!a.fishbowlDefault,
      sort: i,
      source: fileName,
      updated_by: who,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await supabaseServer.from("coa_accounts").insert(rows.slice(i, i + 500));
      if (ins.error) return fail(ins.error.message);
    }
    return NextResponse.json({ ok: true, imported: rows.length });
  }

  if (action === "draft") {
    const { data: cur, error } = await supabaseServer.from("coa_accounts").select("*").eq("chart", "current").order("sort");
    if (error) return fail(error.message);
    if (!cur?.length) return NextResponse.json({ error: "Import the current chart first." }, { status: 400 });
    const { count } = await supabaseServer.from("coa_accounts").select("id", { count: "exact", head: true }).eq("chart", "proposed");
    if ((count ?? 0) > 0 && body?.replace !== true) {
      return NextResponse.json({ error: "A proposed chart already exists. Start over to replace it." }, { status: 409 });
    }
    if ((count ?? 0) > 0) {
      const del = await supabaseServer.from("coa_accounts").delete().eq("chart", "proposed");
      if (del.error) return fail(del.error.message);
    }
    const current: CurrentAccount[] = (cur as Row[]).map((r) => ({
      fullName: String(r.full_name ?? r.name),
      number: (r.number as string) ?? null,
      name: String(r.name),
      parent: (r.parent as string) ?? null,
      type: String(r.type),
      balance: r.balance === null ? null : Number(r.balance),
      description: (r.description as string) ?? null,
      fishbowlDefault: !!r.fishbowl_default,
    }));
    const rows = draftProposedChart(current).map((p) => proposedRow(p, who));
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await supabaseServer.from("coa_accounts").insert(rows.slice(i, i + 500));
      if (ins.error) return fail(ins.error.message);
    }
    return NextResponse.json({ ok: true, proposed: rows.length });
  }

  if (action === "add") {
    const account = (body?.account ?? {}) as Partial<ProposedAccount>;
    const { data: last } = await supabaseServer
      .from("coa_accounts")
      .select("sort")
      .eq("chart", "proposed")
      .order("sort", { ascending: false })
      .limit(1);
    const row = proposedRow(
      { status: "new", type: "Expenses", name: "New account", mapsFrom: [], ...account, sort: Number(last?.[0]?.sort ?? 0) + 1 },
      who,
    );
    const { data, error } = await supabaseServer.from("coa_accounts").insert(row).select().single();
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, account: toProposed(data as Row) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const g = await guard(request, true);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as (Partial<ProposedAccount> & { id?: string }) | null;
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { id: _omit, ...fields } = body ?? {};
  void _omit;
  const { data, error } = await supabaseServer
    .from("coa_accounts")
    .update(proposedRow(fields, g.user.email ?? null))
    .eq("id", id)
    .eq("chart", "proposed")
    .select()
    .single();
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true, account: toProposed(data as Row) });
}

export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { error } = await supabaseServer.from("coa_accounts").delete().eq("id", id).eq("chart", "proposed");
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true });
}
