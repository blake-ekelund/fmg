import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { addMonths, monthKey } from "@/lib/seasonalDemand";

export const runtime = "nodejs";

/**
 * Hand-set demand for a SKU in a month (inventory_demand_overrides), from the
 * Inventory → Demand view.
 *
 *   PUT    { part, month: "yyyy-mm", units }  set (or change) one month
 *   DELETE { part, month: "yyyy-mm" }         reset that month to the forecast
 *   DELETE { part }                           reset every month for the SKU
 *
 * Overrides stick until someone resets them. Nothing else in the app writes
 * this table, so a forecast recalculation or sales sync never replaces one.
 * The shared demand builder (lib/seasonalDemandServer) applies them for every
 * surface: forecast, dashboard, Purchasing, bell, product page.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** How far ahead a month can be set: the forecast shows 12 months. */
const MAX_AHEAD = 23;

function tableMissing(msg: string) {
  return /inventory_demand_overrides|schema cache|does not exist/i.test(msg);
}

const NOT_READY =
  "Demand overrides need migration 20261114070000_inventory_demand_overrides.sql to be applied first.";

export async function PUT(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    part?: string;
    month?: string;
    units?: number;
  };
  const part = String(body.part ?? "").trim();
  const month = String(body.month ?? "");
  const units = Number(body.units);
  if (!part || part.length > 60) return NextResponse.json({ error: "Missing part" }, { status: 400 });
  const now = monthKey(new Date());
  if (!MONTH.test(month) || month < now || month > addMonths(now, MAX_AHEAD)) {
    return NextResponse.json({ error: "Pick a month from this one onward" }, { status: 400 });
  }
  if (!Number.isFinite(units) || units < 0 || units > 10_000_000) {
    return NextResponse.json({ error: "Units must be 0 or more" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("inventory_demand_overrides").upsert(
    {
      part,
      month,
      units: Math.round(units),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "part,month" },
  );
  if (error) {
    return NextResponse.json(
      { error: tableMissing(error.message) ? NOT_READY : error.message },
      { status: tableMissing(error.message) ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { part?: string; month?: string };
  const part = String(body.part ?? "").trim();
  if (!part) return NextResponse.json({ error: "Missing part" }, { status: 400 });

  let q = supabaseServer.from("inventory_demand_overrides").delete().eq("part", part);
  if (body.month !== undefined) {
    if (!MONTH.test(String(body.month))) {
      return NextResponse.json({ error: "Bad month" }, { status: 400 });
    }
    q = q.eq("month", String(body.month));
  }
  const { error } = await q;
  if (error) {
    return NextResponse.json(
      { error: tableMissing(error.message) ? NOT_READY : error.message },
      { status: tableMissing(error.message) ? 503 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
