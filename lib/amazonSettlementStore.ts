import { supabaseServer } from "@/lib/supabaseServer";
import {
  JE_COLUMNS,
  JE_DB_COLUMNS,
  parseSettlementReport,
  type JeColumn,
  type SavedSettlement,
  type SettlementJournalEntry,
} from "@/lib/amazonSettlement";

/**
 * amazon_settlements reads/writes, shared by /api/accounting/amazon-settlements
 * and Sage's import tool. `ready: false` means the migration hasn't been
 * applied yet; callers still get the parsed entry back, just not saved.
 */

export const AMAZON_PAYMENTS_PATH = "/accounting/amazon-payments";

const tableMissing = (msg?: string) => !!msg && /amazon_settlements|schema cache|does not exist/i.test(msg);

type Row = Record<string, unknown>;

const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${m}/${d}/${y}` : ymd;
};

function fromRow(r: Row): SavedSettlement {
  const startDate = String(r.start_date ?? "");
  const endDate = String(r.end_date ?? "");
  return {
    id: String(r.id),
    settlementId: String(r.settlement_id),
    startDate,
    endDate,
    depositDate: String(r.deposit_date ?? ""),
    currency: String(r.currency ?? "USD"),
    label: startDate && endDate ? `${fmtDate(startDate)} to ${fmtDate(endDate)}` : String(r.settlement_id),
    columns: Object.fromEntries(JE_COLUMNS.map((c) => [c, Number(r[JE_DB_COLUMNS[c]] ?? 0)])) as Record<JeColumn, number>,
    total: Number(r.total ?? 0),
    reportedTotal: r.reported_total == null ? null : Number(r.reported_total),
    reconciles: r.reconciles !== false,
    groups: Array.isArray(r.groups) ? (r.groups as SettlementJournalEntry["groups"]) : [],
    lineCount: Number(r.line_count ?? 0),
    fileName: (r.file_name as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  };
}

const BRAND_NAMES: Record<string, string> = { NI: "Natural Inspirations", Sassy: "Sassy + Co" };

/** "Natural Inspirations Eucalyptus Rosemary Mint Hand + Body Lotion 12oz" from the catalog row. */
function describeProduct(p: Row): string {
  const name = String(p.display_name ?? "").trim();
  const brand = BRAND_NAMES[String(p.brand ?? "")] ?? String(p.brand ?? "");
  // Sassy names already carry the brand ("… l Sassy + Co").
  if (!name || /sassy|natural inspirations/i.test(name)) return name;
  const collection = String(p.collection ?? "");
  const scent =
    collection && collection !== "everyday"
      ? collection.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
      : /^[A-Z]{2,4}$/.test(String(p.fragrance ?? "")) ? "" : String(p.fragrance ?? "");
  const size = /^(n\/a)?$/i.test(String(p.size ?? "").trim()) ? "" : String(p.size).trim();
  return [brand, name.toLowerCase().includes(scent.toLowerCase()) ? "" : scent, name, size].filter(Boolean).join(" ");
}

/** Catalog descriptions for every SKU across these entries. */
async function attachSkuNames(items: SavedSettlement[]): Promise<SavedSettlement[]> {
  const skus = [...new Set(items.flatMap((e) => e.groups.map((g) => g.sku).filter((s): s is string => !!s)))];
  if (!skus.length) return items;
  const { data } = await supabaseServer
    .from("inventory_products")
    .select("part, brand, display_name, fragrance, collection, size")
    .in("part", skus);
  const names = Object.fromEntries(((data ?? []) as Row[]).map((p) => [String(p.part), describeProduct(p)]));
  return items.map((e) => ({
    ...e,
    skuNames: Object.fromEntries(e.groups.flatMap((g) => (g.sku && names[g.sku] ? [[g.sku, names[g.sku]]] : []))),
  }));
}

export async function listSettlements(): Promise<{ ready: boolean; items: SavedSettlement[] }> {
  const { data, error } = await supabaseServer
    .from("amazon_settlements")
    .select("*")
    .order("start_date", { ascending: false })
    .order("settlement_id", { ascending: false });
  if (error) {
    if (tableMissing(error.message)) return { ready: false, items: [] };
    throw new Error(error.message);
  }
  return { ready: true, items: await attachSkuNames(((data ?? []) as Row[]).map(fromRow)) };
}

/** Parse a settlement file and save it (replacing any earlier upload of the same settlement). */
export async function importSettlement(
  text: string,
  fileName: string | null,
  userId: string,
): Promise<{ saved: boolean; replaced: boolean; entry: SavedSettlement }> {
  const je = parseSettlementReport(text); // throws SettlementParseError on a bad file
  const unsaved: SavedSettlement = { ...je, id: null, fileName, createdAt: null };

  const { data: existing, error: lookupErr } = await supabaseServer
    .from("amazon_settlements")
    .select("id")
    .eq("settlement_id", je.settlementId)
    .maybeSingle();
  if (lookupErr) {
    if (tableMissing(lookupErr.message)) return { saved: false, replaced: false, entry: unsaved };
    throw new Error(lookupErr.message);
  }

  const row = {
    settlement_id: je.settlementId,
    start_date: je.startDate || null,
    end_date: je.endDate || null,
    deposit_date: je.depositDate || null,
    currency: je.currency,
    ...Object.fromEntries(JE_COLUMNS.map((c) => [JE_DB_COLUMNS[c], je.columns[c]])),
    total: je.total,
    reported_total: je.reportedTotal,
    reconciles: je.reconciles,
    line_count: je.lineCount,
    groups: je.groups,
    file_name: fileName,
    uploaded_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseServer
    .from("amazon_settlements")
    .upsert(row, { onConflict: "settlement_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the settlement.");
  const [entry] = await attachSkuNames([fromRow(data as Row)]);
  return { saved: true, replaced: !!existing, entry };
}

export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabaseServer.from("amazon_settlements").delete().eq("id", id);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}
