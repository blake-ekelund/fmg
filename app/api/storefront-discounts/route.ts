import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { wholesalePortalAdmin } from "@/lib/wholesalePortal";

const BRANDS = ["Sassy", "NI", "both"] as const;
const KINDS = ["percent", "fixed"] as const;

/** Per-code usage rolled up from the storefront orders table. */
type Metric = { uses: number; spent: number; discount: number };
/** The same rollup split by store, so the admin's store filter can scope totals. */
type CodeMetrics = { all: Metric; sassy: Metric; ni: Metric };

const zeroMetric = (): Metric => ({ uses: 0, spent: 0, discount: 0 });

/**
 * Roll up usage for each discount code from the wholesale `orders` table,
 * split by store (sassy / ni) plus a combined `all`, so the admin's store
 * toggle can scope the totals.
 *
 * An order counts as a redemption of code X when it recorded that code — in a
 * `discounts[]` entry's `code`/`label`, or a top-level `discount_code` column
 * (whichever the storefront cart writes once that integration ships). Until the
 * cart applies these codes at checkout, no order references them and every
 * code reads zero — which is the honest, correct state.
 *
 * Mirrors the analytics route's "completed" rule: skip cancelled orders, and
 * for D2C require payment_status `paid` (wholesale orders are placed on terms).
 */
async function computeUsageMetrics(
  codes: string[]
): Promise<{ byCode: Record<string, CodeMetrics>; ordersConnected: boolean }> {
  const byCode: Record<string, CodeMetrics> = {};
  for (const c of codes)
    byCode[c.toUpperCase()] = { all: zeroMetric(), sassy: zeroMetric(), ni: zeroMetric() };

  const admin = wholesalePortalAdmin();
  if (!admin || codes.length === 0) return { byCode, ordersConnected: false };

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  // Orders table not present yet (checkout hasn't shipped) → leave codes at zero.
  if (error) return { byCode, ordersConnected: false };

  const known = new Set(Object.keys(byCode));
  const bump = (m: Metric, total: number, amount: number) => {
    m.uses += 1;
    m.spent += total;
    m.discount += amount;
  };

  for (const o of (data ?? []) as Record<string, unknown>[]) {
    if (o.status === "cancelled") continue;
    const completed = o.channel !== "d2c" || o.payment_status === "paid";
    if (!completed) continue;

    const total = Number(o.total) || 0;
    const rolledDiscount = Number(o.discount) || 0;
    const list = Array.isArray(o.discounts)
      ? (o.discounts as { code?: string; label?: string; amount?: number }[])
      : [];

    // Which known codes did this order redeem, and how much was discounted for each?
    const matched = new Map<string, number>();
    for (const entry of list) {
      const key = String(entry?.code ?? entry?.label ?? "").trim().toUpperCase();
      if (key && known.has(key)) {
        matched.set(key, (matched.get(key) ?? 0) + (Number(entry?.amount) || 0));
      }
    }
    const topCode = String((o.discount_code as string | undefined) ?? "")
      .trim()
      .toUpperCase();
    if (topCode && known.has(topCode) && !matched.has(topCode)) {
      matched.set(topCode, rolledDiscount);
    }

    const store = o.store === "sassy" ? "sassy" : o.store === "ni" ? "ni" : null;
    for (const [key, amount] of matched) {
      const cm = byCode[key];
      bump(cm.all, total, amount);
      if (store) bump(cm[store], total, amount);
    }
  }

  const round = (m: Metric) => {
    m.spent = Math.round(m.spent * 100) / 100;
    m.discount = Math.round(m.discount * 100) / 100;
  };
  for (const key of Object.keys(byCode)) {
    round(byCode[key].all);
    round(byCode[key].sassy);
    round(byCode[key].ni);
  }
  return { byCode, ordersConnected: true };
}

/** Missing-table errors surface as schema-cache misses through PostgREST. */
function isMissingTable(message: string | undefined): boolean {
  return !!message && /schema cache|does not exist/i.test(message);
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        "The storefront_discounts table doesn't exist yet — apply the pending migration (npx supabase db push) to activate discounts.",
      needsMigration: true,
    },
    { status: 503 }
  );
}

/** Normalize a per-customer cap: a positive integer, or null for unlimited. */
function parsePerCustomerLimit(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Generated vs. redeemed counts per unique-code discount, for the table. */
async function computeBatchCounts(): Promise<
  Record<string, { total: number; redeemed: number }>
> {
  const out: Record<string, { total: number; redeemed: number }> = {};
  const { data, error } = await supabaseServer
    .from("storefront_discount_codes")
    .select("discount_id, redeemed_at")
    .limit(100000);
  // Table not migrated yet → no batches; the discounts list still loads.
  if (error || !data) return out;
  for (const row of data as { discount_id: string; redeemed_at: string | null }[]) {
    const e = (out[row.discount_id] ??= { total: 0, redeemed: 0 });
    e.total += 1;
    if (row.redeemed_at) e.redeemed += 1;
  }
  return out;
}

export async function GET(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const discounts = (data ?? []) as { code: string }[];
  const [{ byCode, ordersConnected }, batches] = await Promise.all([
    computeUsageMetrics(discounts.map((d) => d.code)),
    computeBatchCounts(),
  ]);

  return NextResponse.json({
    discounts: data ?? [],
    metrics: byCode,
    batches,
    ordersConnected,
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const code = String(body?.code ?? "")
    .trim()
    .toUpperCase();
  const brand = String(body?.brand ?? "both");
  const kind = String(body?.kind ?? "percent");
  const value = Number(body?.value);

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!BRANDS.includes(brand as (typeof BRANDS)[number])) {
    return NextResponse.json({ error: "invalid brand" }, { status: 400 });
  }
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json(
      { error: "value must be a positive number" },
      { status: 400 }
    );
  }
  if (kind === "percent" && value > 100) {
    return NextResponse.json(
      { error: "percent discounts can't exceed 100" },
      { status: 400 }
    );
  }

  const minSubtotal = Number(body?.min_subtotal);
  const insert = {
    code,
    brand,
    kind,
    value,
    min_subtotal:
      Number.isFinite(minSubtotal) && minSubtotal > 0 ? minSubtotal : null,
    starts_at: body?.starts_at ? String(body.starts_at) : null,
    ends_at: body?.ends_at ? String(body.ends_at) : null,
    note: body?.note ? String(body.note) : null,
    active: body?.active !== false,
    per_customer_limit: parsePerCustomerLimit(body?.per_customer_limit),
    unique_codes: body?.unique_codes === true,
  };

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .insert(insert)
    .select()
    .single();
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `code "${code}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ discount: data });
}

export async function PATCH(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const id = body?.id ? String(body.id) : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only the keys present in the body are touched, so this serves both the
  // lightweight pause/resume toggle and the full edit form.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body?.active === "boolean") patch.active = body.active;
  if (body?.note !== undefined) patch.note = body.note ? String(body.note) : null;
  if (body?.starts_at !== undefined)
    patch.starts_at = body.starts_at ? String(body.starts_at) : null;
  if (body?.ends_at !== undefined)
    patch.ends_at = body.ends_at ? String(body.ends_at) : null;

  if (body?.code !== undefined) {
    const code = String(body.code).trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }
    patch.code = code;
  }
  if (body?.brand !== undefined) {
    if (!BRANDS.includes(String(body.brand) as (typeof BRANDS)[number])) {
      return NextResponse.json({ error: "invalid brand" }, { status: 400 });
    }
    patch.brand = String(body.brand);
  }
  if (body?.kind !== undefined) {
    if (!KINDS.includes(String(body.kind) as (typeof KINDS)[number])) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    patch.kind = String(body.kind);
  }
  if (body?.value !== undefined) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json(
        { error: "value must be a positive number" },
        { status: 400 }
      );
    }
    // The edit form always sends kind alongside value, so we can enforce the cap.
    if (patch.kind === "percent" && value > 100) {
      return NextResponse.json(
        { error: "percent discounts can't exceed 100" },
        { status: 400 }
      );
    }
    patch.value = value;
  }
  if (body?.min_subtotal !== undefined) {
    const minSubtotal = Number(body.min_subtotal);
    patch.min_subtotal =
      Number.isFinite(minSubtotal) && minSubtotal > 0 ? minSubtotal : null;
  }
  if (body?.per_customer_limit !== undefined) {
    patch.per_customer_limit = parsePerCustomerLimit(body.per_customer_limit);
  }
  if (typeof body?.unique_codes === "boolean") patch.unique_codes = body.unique_codes;

  const { data, error } = await supabaseServer
    .from("storefront_discounts")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `code "${patch.code}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ discount: data });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseServer
    .from("storefront_discounts")
    .delete()
    .eq("id", id);
  if (error) {
    if (isMissingTable(error.message)) return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
