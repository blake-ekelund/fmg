import { supabaseServer } from "@/lib/supabaseServer";
import { fishbowlConfigured, withFishbowl } from "@/lib/fishbowl";
import {
  JE_COLUMNS,
  JE_DB_COLUMNS,
  compareWithFishbowl,
  findMissingPeriods,
  parseAmazonPoPeriod,
  settlementTaskName,
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

/** Sale + Kit lines of these Fishbowl orders, from the synced so_items_raw. */
async function fishbowlLines(soIds: number[]): Promise<Row[]> {
  if (!soIds.length) return [];
  const { data } = await supabaseServer
    .from("so_items_raw")
    .select("soid, solineitem, productnum, description, qtyordered, totalprice, typename")
    .in("soid", soIds)
    .in("typename", ["Sale", "Kit"])
    .order("soid")
    .order("solineitem");
  return (data ?? []) as Row[];
}

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
  const amounts = new Map<number, Record<string, number>>();
  for (const l of await fishbowlLines(soIds)) {
    if (!Number(l.totalprice)) continue; // $0 kit components
    const so = Number(l.soid);
    const part = String(l.productnum ?? "");
    const u = units.get(so) ?? {};
    const a = amounts.get(so) ?? {};
    u[part] = (u[part] ?? 0) + Number(l.qtyordered ?? 0);
    a[part] = (a[part] ?? 0) + Number(l.totalprice ?? 0);
    units.set(so, u);
    amounts.set(so, a);
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
          amounts: amounts.get(Number(o.id)) ?? {},
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
  const [[entry], hasFile] = await Promise.all([
    attachNames([data as Row]),
    storeFile(je.settlementId, text),
    completeSettlementTask(je.label),
  ]);
  return { saved: true, replaced: !!existing, entry: { ...entry, hasFile } };
}

export async function deleteSettlement(id: string): Promise<void> {
  const { data: row } = await supabaseServer.from("amazon_settlements").select("settlement_id").eq("id", id).maybeSingle();
  const { error } = await supabaseServer.from("amazon_settlements").delete().eq("id", id);
  if (error && !tableMissing(error.message)) throw new Error(error.message);
  if (row?.settlement_id) await supabaseServer.storage.from(FILE_BUCKET).remove([fileKey(String(row.settlement_id))]);
}

/**
 * Everything needed to explain why a settlement and its Fishbowl sales order
 * disagree — what Sage's investigate_amazon_fishbowl tool reads:
 *  - the rule-based comparison (lines that differ + plain-words explanation);
 *  - Amazon's own order lines for the SKUs that differ, from the original file;
 *  - the Fishbowl order read LIVE (header, note, every line with price and
 *    shipped qty) — falls back to the synced copy if Fishbowl can't be reached;
 *  - the neighbouring Amazon orders' lines for those SKUs, to spot units keyed
 *    on the settlement before or after.
 * Read-only: nothing here changes Fishbowl.
 */
export async function investigateSettlement(settlementId: string): Promise<Record<string, unknown> | null> {
  const je = await getSettlement(settlementId);
  if (!je) return null;
  const comparison = compareWithFishbowl(je);
  const diffSkus = new Set(comparison.state === "missing" ? [] : (comparison.diffs ?? []).map((d) => d.sku));

  // Amazon's lines for the SKUs that differ (orders, refunds), from the kept file.
  const file = await getSettlementFile(settlementId);
  let amazonLines: Record<string, string>[] | string = "The original file wasn't kept for this entry.";
  if (file) {
    const rows = file.text.split(/\r?\n/).map((r) => r.split("\t"));
    const h = rows[0].map((c) => c.trim().toLowerCase());
    const at = (r: string[], name: string) => (r[h.indexOf(name)] ?? "").trim();
    amazonLines = rows
      .slice(1)
      .filter((r) => diffSkus.has(at(r, "sku")) && at(r, "amount-description").toLowerCase() === "principal")
      .map((r) => ({
        sku: at(r, "sku"),
        order_id: at(r, "order-id"),
        posted: at(r, "posted-date").slice(0, 10),
        type: at(r, "transaction-type"),
        amount: at(r, "amount"),
        qty: at(r, "quantity-purchased"),
      }));
  }

  // The Fishbowl order, live. The SO number comes from our own synced table,
  // but it's interpolated into SQL — digits only.
  const soNum = comparison.state === "missing" ? null : comparison.num;
  let fishbowlOrder: Record<string, unknown> = { source: "none" };
  if (soNum && /^\d+$/.test(soNum)) {
    try {
      if (!fishbowlConfigured()) throw new Error("Fishbowl isn't configured here.");
      fishbowlOrder = await withFishbowl(async (query) => {
        const [header] = await query(
          `SELECT so.num, so.customerPO, so.note, so.dateCreated, so.dateIssued, so.dateCompleted, ss.name AS status,
                  u.userName AS createdBy, lg.name AS locationGroup, so.totalPrice
             FROM so
             LEFT JOIN sostatus ss ON ss.id = so.statusId
             LEFT JOIN sysuser u ON u.id = so.createdByUserId
             LEFT JOIN locationgroup lg ON lg.id = so.locationGroupId
            WHERE so.num = '${soNum}'`,
        );
        const lines = await query(
          `SELECT si.soLineItem AS line, sit.name AS type, p.num AS part, si.description, si.qtyOrdered AS qty,
                  si.qtyFulfilled AS shipped, si.unitPrice, si.totalPrice
             FROM soitem si
             JOIN so ON so.id = si.soId
             LEFT JOIN product p ON p.id = si.productId
             LEFT JOIN soitemtype sit ON sit.id = si.typeId
            WHERE so.num = '${soNum}'
            ORDER BY si.soLineItem`,
        );
        return { source: "fishbowl (live)", header, lines };
      });
    } catch (e) {
      const { data: so } = await supabaseServer.from("sales_orders_raw").select("id").eq("num", soNum).maybeSingle();
      fishbowlOrder = {
        source: "synced copy (Fishbowl unreachable: " + (e instanceof Error ? e.message : "error") + ")",
        lines: so ? await fishbowlLines([Number(so.id)]) : [],
      };
    }
  }

  // Neighbouring Amazon orders (periods ending within 31 days) and their lines for the differing SKUs.
  let neighbours: Record<string, unknown>[] = [];
  if (diffSkus.size && je.endDate) {
    const { data: orders } = await supabaseServer
      .from("sales_orders_raw")
      .select("id, num, customerpo")
      .eq("customerid", FISHBOWL_AMAZON_CUSTOMER_ID)
      .neq("customerpo", "")
      .order("id", { ascending: false })
      .limit(200);
    const day = 86_400_000;
    const near = ((orders ?? []) as Row[]).filter((o) => {
      const p = parseAmazonPoPeriod(String(o.customerpo ?? ""));
      return (
        p &&
        String(o.num) !== soNum &&
        Math.abs(new Date(p.end).getTime() - new Date(je.endDate).getTime()) <= 31 * day
      );
    });
    const lines = await fishbowlLines(near.map((o) => Number(o.id)));
    neighbours = near.map((o) => ({
      so: o.num,
      customer_po: o.customerpo,
      lines_for_differing_skus: lines
        .filter((l) => Number(l.soid) === Number(o.id) && diffSkus.has(String(l.productnum)))
        .map((l) => ({ part: l.productnum, qty: l.qtyordered, total: l.totalprice })),
    }));
  }

  return {
    settlement: {
      id: je.settlementId,
      period: je.label,
      sales: je.columns.sales,
      deposit: je.reportedTotal ?? je.total,
      uploaded_by: je.uploadedBy,
    },
    comparison,
    sku_names: Object.fromEntries([...diffSkus].map((s) => [s, je.skuNames?.[s] ?? null])),
    amazon_lines_for_differing_skus: amazonLines,
    fishbowl_order: fishbowlOrder,
    neighbouring_amazon_orders: neighbours,
    page: `/accounting/amazon-payments/${encodeURIComponent(je.settlementId)}`,
  };
}

/* ---------------- Deposit-day tasks ---------------- */

/** Who books Amazon settlements — gets a Task List item when each deposit lands. */
const SETTLEMENT_TASK_OWNER = "Julie";

/**
 * Daily (cron /api/cron/amazon-settlement-tasks): for every settlement period
 * whose deposit date has arrived with no saved entry, make sure there's one
 * task for Julie, due on the deposit date. Tasks are matched by name, so a
 * period never gets a second task — even after it's done or deleted by hand
 * it's only re-added if no task with that name exists.
 */
export async function ensureSettlementTasks(today: string): Promise<{ due: string[]; created: string[] }> {
  const { data, error } = await supabaseServer.from("amazon_settlements").select("start_date, end_date");
  if (error) throw new Error(error.message);
  const entries = ((data ?? []) as Row[]).map((r) => ({ startDate: String(r.start_date ?? ""), endDate: String(r.end_date ?? "") }));
  const due = findMissingPeriods(entries, today).filter((p) => p.kind === "due");
  const created: string[] = [];
  for (const p of due) {
    const name = settlementTaskName(p);
    const { data: existing } = await supabaseServer.from("tasks").select("id").eq("name", name).limit(1);
    if (existing?.length) continue;
    const { error: insErr } = await supabaseServer.from("tasks").insert({
      name,
      description: [
        `Amazon's deposit for ${p.label} should have landed around ${p.expectedDeposit}.`,
        "1. Seller Central → Payments → Reports Repository → download the settlement Flat File V2 (.txt).",
        "2. Upload it on Accounting → Amazon Payments (app.fragrancemarketinggroup.com/accounting/amazon-payments).",
        "3. Key it in Fishbowl as a sales order for AMAZON - CUSTOMER (Customer PO = the period), using the entry's Amazon Data by SKU quantities.",
        "This task ticks itself off when the settlement is uploaded.",
      ].join("\n"),
      owner: SETTLEMENT_TASK_OWNER,
      priority: "Medium",
      status: "todo",
      due_date: p.expectedDeposit,
      completed: false,
      notes: null,
    });
    if (insErr) throw new Error(insErr.message);
    created.push(name);
  }
  return { due: due.map((p) => p.label), created };
}

/** Uploading a settlement completes its deposit-day task, if there is one. */
async function completeSettlementTask(label: string): Promise<void> {
  await supabaseServer
    .from("tasks")
    .update({ status: "done", completed: true })
    .eq("name", settlementTaskName({ label }))
    .eq("completed", false);
}
