"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  JE_COLUMNS,
  JE_COLUMN_LABELS,
  groupsByType,
  summarizeBySku,
  type JeColumn,
  type SavedSettlement,
} from "@/lib/amazonSettlement";

/* Shared by Accounting → Amazon Payments (the list) and each entry's own page
   (/accounting/amazon-payments/[settlementId]). */

export const AMAZON_SETTLEMENTS_API = "/api/accounting/amazon-settlements";
export const entryHref = (je: Pick<SavedSettlement, "settlementId">) =>
  `/accounting/amazon-payments/${encodeURIComponent(je.settlementId)}`;

export const money = (n: number) => {
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${s})` : s;
};

export const shortDate = (ymd: string) =>
  ymd
    ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export type FishbowlCheck =
  | { state: "missing" }
  | {
      state: "ok" | "mismatch";
      num: string;
      status: string;
      /** Fishbowl order total minus the entry's Sales (0 = ties). */
      totalDiff: number;
      /** Parts whose units differ; null when this entry has no units (saved before they were kept). */
      diffs: { sku: string; amazon: number; fishbowl: number }[] | null;
    };

/** Does the hand-keyed Fishbowl sales order match the settlement (Sales $ and units per SKU)? */
export function fishbowlCheck(je: SavedSettlement): FishbowlCheck {
  const fb = je.fishbowl;
  if (!fb) return { state: "missing" };
  const totalDiff = Math.round((fb.total - je.columns.sales) * 100) / 100;
  const { rows } = summarizeBySku(je.groups);
  let diffs: { sku: string; amazon: number; fishbowl: number }[] | null = null;
  if (rows.length && rows[0].units !== null) {
    const amazon = new Map(rows.filter((r) => r.units).map((r) => [r.sku, r.units ?? 0]));
    diffs = [...new Set([...amazon.keys(), ...Object.keys(fb.units)])]
      .map((sku) => ({
        sku,
        amazon: amazon.get(sku) ?? 0,
        fishbowl: fb.units[sku] ?? 0,
      }))
      .filter((d) => d.amazon !== d.fishbowl)
      .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  }
  return {
    state: totalDiff === 0 && !diffs?.length ? "ok" : "mismatch",
    num: fb.num,
    status: fb.status,
    totalDiff,
    diffs,
  };
}

/** "Julie · Nov 10, 2026" — who uploaded the file and when. */
export const uploadedLabel = (je: SavedSettlement) => {
  const when = je.createdAt
    ? new Date(je.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  return [je.uploadedBy, when].filter(Boolean).join(" · ");
};

/* Amazon Data by SKU: the bookkeeping sheet's per-product columns. Advertising
   and FBA Fees have no SKU, so they only appear if some SKU line lands there. */
const SKU_SHEET_COLUMNS: JeColumn[] = ["sales", "shipping", "amazonFees", "promoRebates", "refundedSales", "other"];

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function downloadFile(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Every line type behind the entry, with SKUs merged away. */
export function LineTypeBreakdown({ je }: { je: SavedSettlement }) {
  const types = useMemo(() => groupsByType(je.groups), [je.groups]);
  return (
    <table className="text-xs tabular-nums">
      <tbody>
        {JE_COLUMNS.map((c) =>
          types
            .filter((g) => g.column === c)
            .map((g, i) => (
              <tr key={`${c}-${i}`} className={i === 0 ? "border-t border-gray-200" : ""}>
                <td className="pr-6 py-1 font-medium text-gray-900 whitespace-nowrap">{i === 0 ? JE_COLUMN_LABELS[c] : ""}</td>
                <td className="pr-6 py-1 text-gray-600 whitespace-nowrap">
                  {g.transactionType} › {g.amountType} › {g.amountDescription}
                </td>
                <td className="pr-6 py-1 text-gray-400 text-right">{g.count}×</td>
                <td className="py-1 text-right text-gray-900">{money(g.cents / 100)}</td>
              </tr>
            )),
        )}
      </tbody>
    </table>
  );
}

/** The journal entry itself — every column, like the sheet's yellow summary row. */
export function EntryColumns({ je }: { je: SavedSettlement }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="bg-[#0b2a4a] text-white">
            {[...JE_COLUMNS.map((c) => JE_COLUMN_LABELS[c]), "Total"].map((h) => (
              <th key={h} className="px-2.5 py-1.5 text-right font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-yellow-100 font-medium text-gray-900">
            {JE_COLUMNS.map((c) => (
              <td key={c} className="px-2.5 py-1.5 text-right whitespace-nowrap">
                {money(je.columns[c])}
              </td>
            ))}
            <td className="px-2.5 py-1.5 text-right whitespace-nowrap font-semibold">{money(je.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Main-table cell: the Fishbowl sales order this settlement was keyed as. */
export function FishbowlBadge({ check }: { check: FishbowlCheck }) {
  if (check.state === "missing") return <span className="font-medium text-amber-700">Not entered</span>;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${check.state === "ok" ? "text-green-700" : "text-red-700"}`}>
      {check.state === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} SO {check.num}
    </span>
  );
}

/** Detail line: is it in Fishbowl, and does what was keyed match the file? */
export function FishbowlStatus({ je }: { je: SavedSettlement }) {
  const check = fishbowlCheck(je);
  if (check.state === "missing") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span className="font-semibold">Not in Fishbowl yet.</span> Key it as a sales order for AMAZON - CUSTOMER, Customer PO{" "}
        <span className="font-mono">{poLabel(je)}</span>, location group Amazon Warehouse — one line per SKU using the Qty below
        (order total ${money(je.columns.sales)}). Fishbowl orders sync here 3× a day.
      </div>
    );
  }
  const ok = check.state === "ok";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}
    >
      <div>
        <span className="font-semibold">
          Fishbowl SO {check.num} ({check.status}, PO {je.fishbowl?.customerPO})
        </span>
        {check.totalDiff === 0
          ? ` · order total matches Sales ($${money(je.columns.sales)})`
          : ` · order total $${money(je.fishbowl?.total ?? 0)} vs Sales $${money(je.columns.sales)} (off by ${money(check.totalDiff)})`}
        {check.diffs === null
          ? " · units not checked — upload this settlement's file again to compare quantities"
          : check.diffs.length === 0
            ? " · every SKU's quantity matches"
            : ""}
      </div>
      {check.diffs && check.diffs.length > 0 && (
        <div>
          Quantities that don&apos;t match the file (Fishbowl inventory is off for these):{" "}
          {check.diffs.map((d) => `${d.sku} keyed ${d.fishbowl}, Amazon ${d.amazon}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

/** The Customer PO the Fishbowl order uses: "9/24-10/8/2026". */
export function poLabel(je: SavedSettlement): string {
  const md = (ymd: string) => {
    const [, m, d] = ymd.split("-");
    return `${Number(m)}/${Number(d)}`;
  };
  return je.startDate && je.endDate ? `${md(je.startDate)}-${md(je.endDate)}/${je.endDate.slice(0, 4)}` : je.settlementId;
}

/** Amazon Data by SKU: one row per product, plus the lines with no SKU, tying back to the entry. */
export function SkuTable({ je }: { je: SavedSettlement }) {
  const { hasSkus, rows, unassigned } = useMemo(() => summarizeBySku(je.groups), [je.groups]);

  if (!hasSkus) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        This entry was saved before SKUs were kept. Upload its settlement file again to see Amazon Data by SKU.
      </div>
    );
  }

  const cols = JE_COLUMNS.filter((c) => SKU_SHEET_COLUMNS.includes(c) || rows.some((r) => r.columns[c] !== 0));
  const sum = (c: JeColumn) => rows.reduce((s, r) => s + Math.round(r.columns[c] * 100), 0) / 100;
  const skuTotal = rows.reduce((s, r) => s + Math.round(r.total * 100), 0) / 100;
  // What the SKU table leaves out, by entry column (Advertising, FBA Fees…).
  const unassignedParts = JE_COLUMNS.filter((c) => unassigned.columns[c] !== 0).map(
    (c) => `${JE_COLUMN_LABELS[c]} ${money(unassigned.columns[c])}`,
  );
  const head = ["SKU", "Description", "Qty", ...cols.map((c) => JE_COLUMN_LABELS[c]), "Total"];
  const hasUnits = rows[0]?.units != null;
  const units = rows.reduce((s, r) => s + (r.units ?? 0), 0);
  // Units keyed in Fishbowl, where they differ from the file.
  const check = fishbowlCheck(je);
  const fbDiff = new Map(check.state !== "missing" ? (check.diffs ?? []).map((d) => [d.sku, d.fishbowl]) : []);
  const qty = (r: { units: number | null }) => (r.units == null ? "" : String(r.units));
  // Fishbowl's line price: Sales ÷ units.
  const unitPrice = (r: { units: number | null; columns: Record<JeColumn, number> }) =>
    r.units ? (r.columns.sales / r.units).toFixed(2) : "";

  const download = () =>
    downloadFile(`amazon-by-sku-${je.startDate || je.settlementId}.csv`, [
      [...head.slice(0, 3), "Unit Price", ...head.slice(3)],
      ...rows.map((r) => [
        r.sku,
        je.skuNames?.[r.sku] ?? "",
        qty(r),
        unitPrice(r),
        ...cols.map((c) => r.columns[c].toFixed(2)),
        r.total.toFixed(2),
      ]),
      ["Total by SKU", "", hasUnits ? String(units) : "", "", ...cols.map((c) => sum(c).toFixed(2)), skuTotal.toFixed(2)],
      ["No SKU", unassignedParts.join("; "), "", "", ...cols.map(() => ""), unassigned.total.toFixed(2)],
      ["Journal entry total", je.label, "", "", ...cols.map(() => ""), je.total.toFixed(2)],
    ]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 pt-2">
        <h3 className="text-sm font-semibold text-gray-900">Amazon Data by SKU</h3>
        <span className="text-xs text-gray-500">{rows.length} products</span>
        <button onClick={download} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
          <Download size={13} /> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-[#0b2a4a] text-white">
              {head.map((h, i) => (
                <th key={h} className={`px-2.5 py-1.5 font-semibold whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.sku} className={`border-t border-gray-100 ${i % 2 ? "bg-gray-50/60" : ""}`}>
                <td className="px-2.5 py-1 whitespace-nowrap font-medium text-gray-900">{r.sku}</td>
                <td className="px-2.5 py-1 text-gray-600">
                  {je.skuNames?.[r.sku] ?? <span className="text-gray-400">Not in the catalog</span>}
                </td>
                <td className="px-2.5 py-1 text-right whitespace-nowrap text-gray-900">
                  {r.units == null ? <span className="text-gray-300">–</span> : r.units}
                  {fbDiff.has(r.sku) && (
                    <span
                      className="ml-1.5 rounded bg-red-100 px-1 font-medium text-red-700"
                      title="Units on the Fishbowl sales order"
                    >
                      FB {fbDiff.get(r.sku)}
                    </span>
                  )}
                </td>
                {cols.map((c) => (
                  <td key={c} className="px-2.5 py-1 text-right whitespace-nowrap text-gray-800">
                    {r.columns[c] === 0 ? <span className="text-gray-300">–</span> : money(r.columns[c])}
                  </td>
                ))}
                <td className="px-2.5 py-1 text-right whitespace-nowrap font-semibold text-gray-900">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-300">
            <tr className="font-semibold text-gray-900">
              <td className="px-2.5 py-1.5" colSpan={2}>
                Total by SKU
              </td>
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{hasUnits ? units : ""}</td>
              {cols.map((c) => (
                <td key={c} className="px-2.5 py-1.5 text-right whitespace-nowrap">
                  {money(sum(c))}
                </td>
              ))}
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{money(skuTotal)}</td>
            </tr>
            {unassigned.total !== 0 && (
              <tr className="text-gray-600">
                <td className="px-2.5 py-1" colSpan={3 + cols.length}>
                  No SKU (in the entry only)
                  {unassignedParts.length ? ` — ${unassignedParts.join(", ")}` : ""}
                </td>
                <td className="px-2.5 py-1 text-right whitespace-nowrap">{money(unassigned.total)}</td>
              </tr>
            )}
            <tr className="font-semibold text-gray-900 bg-yellow-100">
              <td className="px-2.5 py-1.5" colSpan={3 + cols.length}>
                Journal entry total
              </td>
              <td className="px-2.5 py-1.5 text-right whitespace-nowrap">{money(je.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
