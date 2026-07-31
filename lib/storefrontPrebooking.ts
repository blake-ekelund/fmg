/**
 * Holiday prebook requests (`holiday_prebook_requests`) — a wholesale buyer
 * reserving quantities of the Sassy holiday line ahead of the season. Read by
 * the Storefronts → Prebookings admin list; status is the only field staff
 * edit inline. New rows can also be added by hand.
 *
 * The shape here MIRRORS the Sassy storefront's /prebook form + action
 * (store/sassy/src/app/prebook): mini hand crème AND gift sets are captured
 * PER PERSONALITY (a `hc_<scent>` case-pack count and a `gs_<scent>` gift-set
 * count each), plus two displays. `hand_creme_cases_total`,
 * `hand_creme_units_total` and `gift_sets_qty` are convenience roll-ups the
 * store also writes — we compute + write them the same way on manual add.
 */

export type PrebookStatus = "new" | "contacted" | "converted" | "archived";

/** The six holiday personalities, in display order (keys match the DB columns).
    `code` is the Fishbowl fragrance suffix shared across product families —
    confirmed against inventory_products for the 124-00-XX (mini hand crème)
    and 224-00-XX (lip butter) parts. */
export const SCENTS: { key: string; name: string; color: string; code: string }[] = [
  { key: "up_to_snow_good", name: "Up to Snow Good", color: "#3f6fa3", code: "05" },
  { key: "sleigh_all_day", name: "Sleigh All Day", color: "#158a8a", code: "07" },
  { key: "naughty_and_nice", name: "Naughty & Nice", color: "#b12a72", code: "04" },
  { key: "fa_la_la_fabulous", name: "Fa La La Fabulous", color: "#d4762f", code: "06" },
  { key: "holly_dazed", name: "Holly Dazed", color: "#2c5c3f", code: "02" },
  { key: "ho_ho_glow", name: "Ho Ho Glow", color: "#c4283b", code: "01" },
];

/* Fishbowl part numbers (product numbers), from inventory_products.
   124-00-XX and 224-00-XX are confirmed for all six scents; the gift-set
   series follows the same fragrance codes — 411-00-01 (Ho Ho Glow) exists in
   Fishbowl today and the other five are inferred from the numbering scheme,
   so verify when those parts are created. */
export const hcSku = (code: string) => `124-00-${code}`;
export const gsSku = (code: string) => `411-00-${code}`;
export const lbSku = (code: string) => `224-00-${code}`;
export const HC_DISPLAY_SKU = "512-01-99";
export const LIP_DISPLAY_SKU = "515-00-99";

export const hcField = (key: string) => `hc_${key}`;
export const gsField = (key: string) => `gs_${key}`;
/** Per-scent individual lip butter line (case packs of 6). */
export const lbField = (key: string) => `lb_${key}`;
export const HC_DISPLAY_KEY = "hand_creme_display_qty";
export const LIP_BUTTER_KEY = "lip_butter_qty";

/* Pricing + pack sizes — identical to the storefront's constants
   (store/sassy/src/app/prebook/constants.ts). Every per-scent count is a CASE
   PACK, priced as such: a `gs_` count of 1 is 4 gift sets = $56, never $14. */
export const HAND_CREME_PER_CASE = 6; // minis per case pack
export const HAND_CREME_CASE_PRICE = 30; // 6 × $5
export const GIFT_SETS_PER_CASE = 4; // gift sets per case pack
export const GIFT_SET_PRICE = 14; // $ per individual set
export const GIFT_SET_CASE_PRICE = GIFT_SETS_PER_CASE * GIFT_SET_PRICE; // $56
export const LIP_BUTTER_PER_PACK = 6; // lip butters per case pack
export const LIP_BUTTER_UNIT_PRICE = 3; // $ per lip butter
export const LIP_BUTTER_PACK_PRICE = LIP_BUTTER_PER_PACK * LIP_BUTTER_UNIT_PRICE; // $18
export const HC_DISPLAY_PRICE = 220;
export const LIP_DISPLAY_PRICE = 113;
export const LIP_BUTTER_PER_CASE = 36; // lip butters per display

export type PrebookRequest = {
  id: string;
  created_at: string;
  store: string; // 'sassy' | 'ni'
  profile_id: string | null;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: PrebookStatus;
  hand_creme_cases_total: number;
  hand_creme_units_total: number;
  gift_sets_qty: number;
  hand_creme_display_qty: number;
  lip_butter_qty: number;
  // hc_<scent> and gs_<scent> per personality, read via helpers.
  [key: string]: unknown;
};

export const PREBOOK_STATUSES: { key: PrebookStatus; label: string; badge: string }[] = [
  { key: "new", label: "New", badge: "bg-rose-50 text-rose-700" },
  { key: "contacted", label: "Contacted", badge: "bg-amber-50 text-amber-700" },
  { key: "converted", label: "Converted", badge: "bg-emerald-50 text-emerald-700" },
  { key: "archived", label: "Archived", badge: "bg-gray-100 text-gray-500" },
];

export function statusMeta(status: string): { label: string; badge: string } {
  return PREBOOK_STATUSES.find((s) => s.key === status) ?? { label: status, badge: "bg-gray-100 text-gray-500" };
}

const int = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export type PrebookLine = { label: string; qty: number; unit?: string; group: "creme" | "giftset" | "lip" | "display" };

/** Every ordered line with qty > 0 — "what was ordered", folded flat. */
export function prebookLines(r: PrebookRequest): PrebookLine[] {
  const lines: PrebookLine[] = [];
  for (const s of SCENTS) {
    const cases = int(r[hcField(s.key)]);
    if (cases > 0) lines.push({ label: s.name, qty: cases, unit: "HC cases", group: "creme" });
  }
  for (const s of SCENTS) {
    const gs = int(r[gsField(s.key)]);
    if (gs > 0) lines.push({ label: s.name, qty: gs, unit: "GS cases", group: "giftset" });
  }
  for (const s of SCENTS) {
    const lb = int(r[lbField(s.key)]);
    if (lb > 0) lines.push({ label: s.name, qty: lb, unit: "lip packs", group: "lip" });
  }
  const hcd = int(r[HC_DISPLAY_KEY]);
  if (hcd > 0) lines.push({ label: "Mini Hand Crème Display", qty: hcd, unit: "displays", group: "display" });
  const lip = int(r[LIP_BUTTER_KEY]);
  if (lip > 0) lines.push({ label: "SPF 30 Lip Butter Display", qty: lip, unit: "displays", group: "display" });
  return lines;
}

/** Buyer display name — business first, falling back to the contact. */
export function buyerName(r: PrebookRequest): string {
  return r.business_name || r.contact_name || "—";
}

export type PrebookInvoiceLine = {
  /** Fishbowl part number, for keying the order in. */
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

/**
 * The request as priced invoice lines — one row per ordered item, in line-sheet
 * order (hand crème case packs by scent, then gift sets by scent, then the two
 * displays). Quantities are wholesale estimates; nothing is charged.
 */
export function prebookInvoiceLines(r: PrebookRequest): PrebookInvoiceLine[] {
  const lines: PrebookInvoiceLine[] = [];
  for (const s of SCENTS) {
    const c = int(r[hcField(s.key)]);
    if (c > 0)
      lines.push({
        sku: hcSku(s.code),
        description: `${s.name} — Mini Hand Crème (case of ${HAND_CREME_PER_CASE})`,
        qty: c,
        unitPrice: HAND_CREME_CASE_PRICE,
        amount: c * HAND_CREME_CASE_PRICE,
      });
  }
  for (const s of SCENTS) {
    const g = int(r[gsField(s.key)]);
    if (g > 0)
      lines.push({
        sku: gsSku(s.code),
        description: `${s.name} — Gift Set (case of ${GIFT_SETS_PER_CASE})`,
        qty: g,
        unitPrice: GIFT_SET_CASE_PRICE,
        amount: g * GIFT_SET_CASE_PRICE,
      });
  }
  for (const s of SCENTS) {
    const lb = int(r[lbField(s.key)]);
    if (lb > 0)
      lines.push({
        sku: lbSku(s.code),
        description: `${s.name} — SPF 30 Lip Butter (case of ${LIP_BUTTER_PER_PACK})`,
        qty: lb,
        unitPrice: LIP_BUTTER_PACK_PRICE,
        amount: lb * LIP_BUTTER_PACK_PRICE,
      });
  }
  const hcd = int(r[HC_DISPLAY_KEY]);
  if (hcd > 0)
    lines.push({
      sku: HC_DISPLAY_SKU,
      description: "Holiday Sassy Mini Hand Crème Display",
      qty: hcd,
      unitPrice: HC_DISPLAY_PRICE,
      amount: hcd * HC_DISPLAY_PRICE,
    });
  const lip = int(r[LIP_BUTTER_KEY]);
  if (lip > 0)
    lines.push({
      sku: LIP_DISPLAY_SKU,
      description: `Holiday SPF 30 Lip Butter Display (${LIP_BUTTER_PER_CASE}-ct)`,
      qty: lip,
      unitPrice: LIP_DISPLAY_PRICE,
      amount: lip * LIP_DISPLAY_PRICE,
    });
  return lines;
}

/** Estimated wholesale total for a request (or a raw qty map). */
export function estimatedTotal(qty: Record<string, unknown>): number {
  let sum = 0;
  for (const s of SCENTS) {
    sum += int(qty[hcField(s.key)]) * HAND_CREME_CASE_PRICE;
    sum += int(qty[gsField(s.key)]) * GIFT_SET_CASE_PRICE;
    sum += int(qty[lbField(s.key)]) * LIP_BUTTER_PACK_PRICE;
  }
  sum += int(qty[HC_DISPLAY_KEY]) * HC_DISPLAY_PRICE;
  sum += int(qty[LIP_BUTTER_KEY]) * LIP_DISPLAY_PRICE;
  return sum;
}

/** Aggregate quantities across a set of requests (for the totals strip),
 *  computed from the per-scent + display columns so it's correct regardless of
 *  whether the roll-up columns were populated. */
export function aggregateTotals(rows: PrebookRequest[]): {
  cases: number;
  minis: number;
  /** Gift-set CASE PACKS (each = 4 sets). */
  giftSets: number;
  /** Individual gift sets (cases × 4). */
  giftSetUnits: number;
  /** Per-scent lip butter case packs (each = 6). */
  lipPacks: number;
  hcDisplays: number;
  lipDisplays: number;
  estimated: number;
} {
  let cases = 0, giftSets = 0, lipPacks = 0, hcDisplays = 0, lipDisplays = 0, estimated = 0;
  for (const r of rows) {
    for (const s of SCENTS) {
      cases += int(r[hcField(s.key)]);
      giftSets += int(r[gsField(s.key)]);
      lipPacks += int(r[lbField(s.key)]);
    }
    hcDisplays += int(r[HC_DISPLAY_KEY]);
    lipDisplays += int(r[LIP_BUTTER_KEY]);
    estimated += estimatedTotal(r);
  }
  return {
    cases,
    minis: cases * HAND_CREME_PER_CASE,
    giftSets,
    giftSetUnits: giftSets * GIFT_SETS_PER_CASE,
    lipPacks,
    hcDisplays,
    lipDisplays,
    estimated,
  };
}

/** "$1,234.00" — money always shows cents, matching the storefront. */
export const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
