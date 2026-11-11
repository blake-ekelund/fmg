import { supabaseServer } from "@/lib/supabaseServer";
import {
  JE_COLUMNS,
  JE_DB_COLUMNS,
  parseAmazonPoPeriod,
  parseSettlementReport,
  type FishbowlAmazonOrder,
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

/** Fishbowl's Amazon customer — every settlement is keyed as one of its sales orders. */
const FISHBOWL_AMAZON_CUSTOMER_ID = "12345";

/**
 * The Fishbowl sales order each settlement was keyed as, from the synced copy
 * (sales_orders_raw / so_items_raw, refreshed 3×/day — never a live Fishbowl
 * login per page view). Matched on the Customer PO period: exact start + end
 * first, then end date alone to forgive a mistyped start.
 */
async function attachFishbowl(items: SavedSettlement[]): Promise<SavedSettlement[]> {
  if (!items.length) return items;
  const { data: orders, error } = await supabaseServer
    .from("sales_orders_raw")
    .select("id, num, customerpo, status, totalprice")
    .eq("customerid", FISHBOWL_AMAZON_CUSTOMER_ID)
    .neq("customerpo", "")
    .order("id", { ascending: false });
  if (error) return items; // the page still works without the match
  const periods = ((orders ?? []) as Row[]).flatMap((o) => {
    const p = parseAmazonPoPeriod(String(o.customerpo ?? ""));
    return p ? [{ o, ...p }] : [];
  });
  const matched = new Map<string, Row>();
  for (const e of items) {
    const hit =
      periods.find((p) => p.start === e.startDate && p.end === e.endDate) ?? periods.find((p) => p.end === e.endDate);
    if (hit) matched.set(e.settlementId, hit.o);
  }

  const soIds = [...new Set([...matched.values()].map((o) => Number(o.id)))];
  const units = new Map<number, Record<string, number>>();
  if (soIds.length) {
    const { data: lines } = await supabaseServer
      .from("so_items_raw")
      .select("soid, productnum, qtyordered, totalprice, solineitem")
      .in("soid", soIds)
      .in("typename", ["Sale", "Kit"])
      .order("soid")
      .order("solineitem");
    for (const l of (lines ?? []) as Row[]) {
      if (!Number(l.totalprice)) continue; // $0 kit components
      const u = units.get(Number(l.soid)) ?? {};
      const part = String(l.productnum ?? "");
      u[part] = (u[part] ?? 0) + Number(l.qtyordered ?? 0);
      units.set(Number(l.soid), u);
    }
  }

  return items.map((e) => {
    const o = matched.get(e.settlementId);
    const fishbowl: FishbowlAmazonOrder | null = o
      ? {
          num: String(o.num),
          status: String(o.status ?? ""),
          customerPO: String(o.customerpo ?? ""),
          total: Number(o.totalprice ?? 0),
          units: units.get(Number(o.id)) ?? {},
        }
      : null;
    return { ...e, fishbowl };
  });
}

/** Catalog descriptions for every SKU, and the uploader's name, across these entries. */
async function attachNames(rows: Row[]): Promise<SavedSettlement[]> {
  const items = rows.map(fromRow);
  const skus = [...new Set(items.flatMap((e) => e.groups.map((g) => g.sku).filter((s): s is string => !!s)))];
  const userIds = [...new Set(rows.map((r) => r.uploaded_by).filter((u): u is string => typeof u === "string"))];
  const [products, profiles] = await Promise.all([
    skus.length
      ? supabaseServer.from("inventory_products").select("part, brand, display_name, fragrance, collection, size").in("part", skus)
      : Promise.resolve({ data: [] as Row[] }),
    userIds.length
      ? supabaseServer.from("profiles").select("id, first_name").in("id", userIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const names = Object.fromEntries(((products.data ?? []) as Row[]).map((p) => [String(p.part), describeProduct(p)]));
  const people = Object.fromEntries(((profiles.data ?? []) as Row[]).map((p) => [String(p.id), String(p.first_name ?? "")]));
  return attachFishbowl(
    items.map((e, i) => ({
      ...e,
      skuNames: Object.fromEntries(e.groups.flatMap((g) => (g.sku && names[g.sku] ? [[g.sku, names[g.sku]]] : []))),
      uploadedBy: people[String(rows[i].uploaded_by)] || null,
    })),
  );
}

/* The uploaded settlement files, as uploaded, so an entry's source can be
   downloaded again. Private bucket, one object per settlement ("<id>.txt");
   re-uploading a settlement replaces its file along with its row. */
const FILE_BUCKET = "amazon-settlements";
const fileKey = (settlementId: string) => `${settlementId}.txt`;

async function storeFile(settlementId: string, text: string): Promise<boolean> {
  const put = () =>
    supabaseServer.storage
      .from(FILE_BUCKET)
      .upload(fileKey(settlementId), new Blob([text], { type: "text/plain" }), { upsert: true, contentType: "text/plain" });
  let { error } = await put();
  if (error && /bucket not found/i.test(error.message)) {
    await supabaseServer.storage.createBucket(FILE_BUCKET, { public: false });
    ({ error } = await put());
  }
  // The entry is what matters; a missing file only hides the download.
  if (error) console.error("amazon settlement file not stored", settlementId, error.message);
  return !error;
}

/** Settlement ids that have their original file kept. */
async function storedFileIds(): Promise<Set<string>> {
  const { data } = await supabaseServer.storage.from(FILE_BUCKET).list("", { limit: 1000 });
  return new Set((data ?? []).map((f) => f.name.replace(/\.txt$/, "")));
}

/** The original file for a settlement, or null if it wasn't kept. */
export async function getSettlementFile(settlementId: string): Promise<{ text: string; fileName: string } | null> {
  const { data: row } = await supabaseServer
    .from("amazon_settlements")
    .select("file_name")
    .eq("settlement_id", settlementId)
    .maybeSingle();
  const { data } = await supabaseServer.storage.from(FILE_BUCKET).download(fileKey(settlementId));
  if (!data) return null;
  return { text: await data.text(), fileName: (row?.file_name as string | null) || fileKey(settlementId) };
}

export async function listSettlements(): Promise<{ ready: boolean; items: SavedSettlement[] }> {
  const [{ data, error }, files] = await Promise.all([
    supabaseServer
      .from("amazon_settlements")
      .select("*")
      .order("start_date", { ascending: false })
      .order("settlement_id", { ascending: false }),
    storedFileIds(),
  ]);
  if (error) {
    if (tableMissing(error.message)) return { ready: false, items: [] };
    throw new Error(error.message);
  }
  const items = await attachNames((data ?? []) as Row[]);
  return { ready: true, items: items.map((e) => ({ ...e, hasFile: files.has(e.settlementId) })) };
}

/** One entry by its Amazon settlement id (the per-entry page). */
export async function getSettlement(settlementId: string): Promise<SavedSettlement | null> {
  const { data, error } = await supabaseServer
    .from("amazon_settlements")
    .select("*")
    .eq("settlement_id", settlementId)
    .maybeSingle();
  if (error) {
    if (tableMissing(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const [[entry], files] = await Promise.all([attachNames([data as Row]), storedFileIds()]);
  return { ...entry, hasFile: files.has(settlementId) };
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
  const [[entry], hasFile] = await Promise.all([attachNames([data as Row]), storeFile(je.settlementId, text)]);
  return { saved: true, replaced: !!existing, entry: { ...entry, hasFile } };
}

export async function deleteSettlement(id: string): Promise<void> {
  const { data: row } = await supabaseServer.from("amazon_settlements").select("settlement_id").eq("id", id).maybeSingle();
  const { error } = await supabaseServer.from("amazon_settlements").delete().eq("id", id);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
  if (row?.settlement_id) await supabaseServer.storage.from(FILE_BUCKET).remove([fileKey(String(row.settlement_id))]);
}
