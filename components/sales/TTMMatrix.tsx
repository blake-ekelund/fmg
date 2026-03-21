"use client";

import { useState } from "react";

type MatrixMode = "products" | "fragrances";

type Row = {
  month: string;
  productnum: string;
  display_name: string | null;
  fragrance: string | null;
  revenue: number;
};

/* ---------- FRAGRANCE WHITELIST ---------- */

const ALLOWED_FRAGRANCES = new Set([
  "Sea Salt",
  "Grapefruit",
  "Lavender",
  "Eucalyptus",
  "Coconut",
  "Agave Pear",
  "Cypres",
]);

/* ---------- HELPERS ---------- */

function ym(year: number, jsMonth: number) {
  return `${year}-${String(jsMonth + 1).padStart(2, "0")}-01`;
}

function getTrailingMonths(endYear: number, endMonth: number) {
  const months: string[] = [];
  let y = endYear;
  let m = endMonth - 1;

  for (let i = 0; i < 12; i++) {
    months.push(ym(y, m));
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }

  return months.reverse();
}

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function rowTTM(months: string[], byMonth: Record<string, number>) {
  return months.reduce((sum, m) => sum + (byMonth[m] ?? 0), 0);
}

function fmt(n: number) {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

/* ---------- COMPONENT ---------- */

export function Trailing12MonthMatrix({
  rows,
  mode,
  endYear,
  endMonth,
}: {
  rows: Row[];
  mode: MatrixMode;
  endYear: number;
  endMonth: number;
}) {
  const months = getTrailingMonths(endYear, endMonth);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  /* ---------- CONFIG BASED ON MODE ---------- */

  const primaryKey = (r: Row) => {
    if (mode === "products") return r.display_name ?? "Unknown";
    const f = r.fragrance ?? "—";
    return ALLOWED_FRAGRANCES.has(f) ? f : "Other";
  };

  const detailKey = (r: Row) =>
    mode === "products"
      ? r.fragrance ?? "—"
      : r.display_name ?? "Unknown";

  const headerLabel =
    mode === "products" ? "Sales by Product" : "Sales by Fragrance";

  // Products uses top 15; Fragrances uses whitelist (no top-N)
  const topLimit = mode === "products" ? 15 : Infinity;

  /* ---------- TOP-LEVEL AGGREGATION ---------- */

  const totalsByPrimary = Object.values(
    rows.reduce<Record<string, { key: string; total: number }>>((acc, r) => {
      const key = primaryKey(r);
      if (!acc[key]) acc[key] = { key, total: 0 };
      acc[key].total += r.revenue;
      return acc;
    }, {})
  );

  const topKeys =
    mode === "products"
      ? new Set(
          totalsByPrimary
            .sort((a, b) => b.total - a.total)
            .slice(0, topLimit)
            .map((p) => p.key)
        )
      : new Set(Array.from(ALLOWED_FRAGRANCES).concat(["Other"]));

  const primaryRows = rows.reduce<Record<string, { key: string; label: string; byMonth: Record<string, number> }>>((acc, r) => {
    const key = primaryKey(r);
    const bucket = topKeys.has(key) ? key : "__OTHER__"; // __OTHER__ only relevant in products mode

    if (!acc[bucket]) {
      acc[bucket] = {
        key: bucket,
        label: bucket === "__OTHER__" ? "Other" : key,
        byMonth: {},
      };
    }

    acc[bucket].byMonth[r.month] = (acc[bucket].byMonth[r.month] ?? 0) + r.revenue;
    return acc;
  }, {});

  const primaryList = Object.values(primaryRows);

  const normalItems =
    mode === "products"
      ? primaryList
          .filter((p) => p.key !== "__OTHER__")
          .sort((a, b) => rowTTM(months, b.byMonth) - rowTTM(months, a.byMonth))
      : [
          // fixed order whitelist
          ...Array.from(ALLOWED_FRAGRANCES).map((f) => {
            const found = primaryList.find((p) => p.label === f);
            return (
              found ?? {
                key: f,
                label: f,
                byMonth: {},
              }
            );
          }),
        ];

  const otherRow =
    mode === "products"
      ? primaryList.find((p) => p.key === "__OTHER__")
      : primaryList.find((p) => p.label === "Other") ?? {
          key: "Other",
          label: "Other",
          byMonth: {},
        };

  /* ---------- TOTALS ---------- */

  const totalsByMonth = months.map((m) =>
    rows.reduce((sum, r) => (r.month === m ? sum + r.revenue : sum), 0)
  );

  const ttmTotal = totalsByMonth.reduce((a, b) => a + b, 0);

  /* ---------- RENDER ---------- */

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-max w-full text-xs table-fixed">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider" style={{ width: 260 }}>
              {headerLabel}
            </th>

            {months.map((m) => (
              <th key={m} className="px-3 py-2.5 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                {formatMonthLabel(m)}
              </th>
            ))}

            <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-900 uppercase tracking-wider">TTM</th>
          </tr>
        </thead>

        <tbody>
          {/* ---------- PRIMARY ROWS ---------- */}
          {normalItems.map((p) => {
            const isOpen = expandedKey === p.key;
            const ttm = rowTTM(months, p.byMonth);

            return (
              <>
                <tr
                  key={p.key}
                  className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 transition-colors"
                  onClick={() => setExpandedKey(isOpen ? null : p.key)}
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5" style={{ width: 260 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                      <span className="font-medium text-gray-900">{p.label}</span>
                    </div>
                  </td>

                  {months.map((m) => (
                    <td key={m} className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                      {p.byMonth[m] ? fmt(p.byMonth[m]) : "—"}
                    </td>
                  ))}

                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{fmt(ttm)}</td>
                </tr>

                {/* ---------- DETAIL ROWS ---------- */}
                {isOpen &&
                  Object.values(
                    rows
                      .filter((r) => primaryKey(r) === p.label)
                      .reduce<Record<string, { label: string; byMonth: Record<string, number> }>>((acc, r) => {
                        const d = detailKey(r);
                        if (!acc[d]) acc[d] = { label: d, byMonth: {} };
                        acc[d].byMonth[r.month] = (acc[d].byMonth[r.month] ?? 0) + r.revenue;
                        return acc;
                      }, {})
                  )
                    .sort((a, b) => rowTTM(months, b.byMonth) - rowTTM(months, a.byMonth))
                    .map((d) => {
                      const dttm = rowTTM(months, d.byMonth);

                      return (
                        <tr key={`${p.key}-${d.label}`} className="bg-gray-50/60 border-b border-gray-50">
                          <td
                            className="sticky left-0 z-10 bg-gray-50/60 pl-9 pr-3 py-1.5 text-[11px] text-gray-500"
                            style={{ width: 260 }}
                          >
                            {d.label}
                          </td>

                          {months.map((m) => (
                            <td key={m} className="px-3 py-1.5 text-right text-[11px] tabular-nums text-gray-500">
                              {d.byMonth[m] ? fmt(d.byMonth[m]) : "—"}
                            </td>
                          ))}

                          <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-gray-600">{fmt(dttm)}</td>
                        </tr>
                      );
                    })}
              </>
            );
          })}

          {/* ---------- OTHER (ALWAYS SECOND TO LAST) ---------- */}
          {otherRow && (
            <tr className="bg-gray-50 border-b border-gray-200">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5 font-medium text-gray-700" style={{ width: 260 }}>
                Other
              </td>

              {months.map((m) => (
                <td key={m} className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                  {otherRow.byMonth[m] ? fmt(otherRow.byMonth[m]) : "—"}
                </td>
              ))}

              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-700">{fmt(rowTTM(months, otherRow.byMonth))}</td>
            </tr>
          )}

          {/* ---------- TOTAL SALES (ALWAYS LAST) ---------- */}
          <tr className="bg-gray-900 text-white">
            <td className="sticky left-0 z-10 bg-gray-900 px-3 py-3 font-semibold rounded-bl-xl" style={{ width: 260 }}>
              Total Sales
            </td>

            {totalsByMonth.map((v, i) => (
              <td key={i} className="px-3 py-3 text-right tabular-nums font-medium">
                {fmt(v)}
              </td>
            ))}

            <td className="px-3 py-3 text-right tabular-nums font-semibold rounded-br-xl">{fmt(ttmTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
