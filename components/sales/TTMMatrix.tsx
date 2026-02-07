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

  const primaryKey = (r: Row) =>
    mode === "products"
      ? r.display_name ?? "Unknown"
      : r.fragrance ?? "—";

  const detailKey = (r: Row) =>
    mode === "products"
      ? r.fragrance ?? "—"
      : r.display_name ?? "Unknown";

  const headerLabel =
    mode === "products"
      ? "Sales by Product"
      : "Sales by Fragrance";

  const topLimit = mode === "products" ? 15 : 10;

  /* ---------- TOP-LEVEL AGGREGATION ---------- */

  const totalsByPrimary = Object.values(
    rows.reduce<Record<string, { key: string; total: number }>>(
      (acc, r) => {
        const key = primaryKey(r);
        if (!acc[key]) acc[key] = { key, total: 0 };
        acc[key].total += r.revenue;
        return acc;
      },
      {}
    )
  );

  const topKeys = new Set(
    totalsByPrimary
      .sort((a, b) => b.total - a.total)
      .slice(0, topLimit)
      .map((p) => p.key)
  );

  const primaryRows = rows.reduce<Record<string, any>>(
    (acc, r) => {
      const key = primaryKey(r);
      const bucket = topKeys.has(key) ? key : "__OTHER__";

      if (!acc[bucket]) {
        acc[bucket] = {
          key: bucket,
          label: bucket === "__OTHER__" ? "Other" : key,
          byMonth: {},
        };
      }

      acc[bucket].byMonth[r.month] =
        (acc[bucket].byMonth[r.month] ?? 0) + r.revenue;

      return acc;
    },
    {}
  );

  const primaryList = Object.values(primaryRows);

  const normalItems = primaryList
    .filter((p) => p.key !== "__OTHER__")
    .sort(
      (a, b) =>
        rowTTM(months, b.byMonth) -
        rowTTM(months, a.byMonth)
    );

  const otherRow = primaryList.find(
    (p) => p.key === "__OTHER__"
  );

  /* ---------- TOTALS ---------- */

  const totalsByMonth = months.map((m) =>
    rows.reduce(
      (sum, r) => (r.month === m ? sum + r.revenue : sum),
      0
    )
  );

  const ttmTotal = totalsByMonth.reduce((a, b) => a + b, 0);

  /* ---------- RENDER ---------- */

  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200/60">
      <table className="min-w-max w-full text-xs table-fixed">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th
              className="sticky left-0 bg-gray-50 px-2 py-1 text-left"
              style={{ width: 260 }}
            >
              {headerLabel}
            </th>

            {months.map((m) => (
              <th key={m} className="px-2 py-1 text-right">
                {formatMonthLabel(m)}
              </th>
            ))}

            <th className="px-2 py-1 text-right font-semibold">
              TTM
            </th>
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
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() =>
                    setExpandedKey(isOpen ? null : p.key)
                  }
                >
                  <td
                    className="sticky left-0 bg-white px-2 py-1"
                    style={{ width: 260 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span>{p.label}</span>
                    </div>
                  </td>

                  {months.map((m) => (
                    <td key={m} className="px-2 py-1 text-right">
                      {p.byMonth[m] ? fmt(p.byMonth[m]) : "—"}
                    </td>
                  ))}

                  <td className="px-2 py-1 text-right font-medium">
                    {fmt(ttm)}
                  </td>
                </tr>

                {/* ---------- DETAIL ROWS ---------- */}
                {isOpen &&
                  Object.values(
                    rows
                      .filter(
                        (r) =>
                          primaryKey(r) === p.label ||
                          (p.key === "__OTHER__" &&
                            !topKeys.has(primaryKey(r)))
                      )
                      .reduce<Record<string, any>>(
                        (acc, r) => {
                          const d = detailKey(r);
                          if (!acc[d]) {
                            acc[d] = {
                              label: d,
                              byMonth: {},
                            };
                          }
                          acc[d].byMonth[r.month] =
                            (acc[d].byMonth[r.month] ?? 0) +
                            r.revenue;
                          return acc;
                        },
                        {}
                      )
                  )
                    .sort(
                      (a: any, b: any) =>
                        rowTTM(months, b.byMonth) -
                        rowTTM(months, a.byMonth)
                    )
                    .map((d) => {
                      const dttm = rowTTM(
                        months,
                        d.byMonth
                      );

                      return (
                        <tr
                          key={`${p.key}-${d.label}`}
                          className="bg-gray-50"
                        >
                          <td
                            className="sticky left-0 bg-gray-50 px-6 py-1 text-gray-600"
                            style={{ width: 260 }}
                          >
                            {d.label}
                          </td>

                          {months.map((m) => (
                            <td
                              key={m}
                              className="px-2 py-1 text-right text-gray-600"
                            >
                              {d.byMonth[m]
                                ? fmt(d.byMonth[m])
                                : "—"}
                            </td>
                          ))}

                          <td className="px-2 py-1 text-right text-gray-600">
                            {fmt(dttm)}
                          </td>
                        </tr>
                      );
                    })}
              </>
            );
          })}

          {/* ---------- OTHER ---------- */}
          {otherRow && (
            <tr className="bg-gray-50 font-medium">
              <td
                className="sticky left-0 bg-gray-50 px-2 py-1"
                style={{ width: 260 }}
              >
                Other
              </td>

              {months.map((m) => (
                <td key={m} className="px-2 py-1 text-right">
                  {otherRow.byMonth[m]
                    ? fmt(otherRow.byMonth[m])
                    : "—"}
                </td>
              ))}

              <td className="px-2 py-1 text-right">
                {fmt(
                  rowTTM(months, otherRow.byMonth)
                )}
              </td>
            </tr>
          )}

          {/* ---------- TOTAL SALES ---------- */}
          <tr className="bg-gray-100 font-semibold">
            <td
              className="sticky left-0 bg-gray-100 px-2 py-1"
              style={{ width: 260 }}
            >
              Total Sales
            </td>

            {totalsByMonth.map((v, i) => (
              <td key={i} className="px-2 py-1 text-right">
                {fmt(v)}
              </td>
            ))}

            <td className="px-2 py-1 text-right">
              {fmt(ttmTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
