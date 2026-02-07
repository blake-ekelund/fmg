"use client";

type Row = {
  month: string;
  productnum: string;
  display_name: string | null;
  fragrance: string | null;
  revenue: number;
};

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

function isOtherRow(p: any) {
  return p.key === "__OTHER__" || p.label === "Other";
}

function rowTTM(months: string[], byMonth: Record<string, number>) {
  return months.reduce((sum, m) => sum + (byMonth[m] ?? 0), 0);
}

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month - 1, 1); // local-safe
  return d.toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function Trailing12MonthMatrix({
  rows,
  isFiltered,
  endYear,
  endMonth,
}: {
  rows: Row[];
  isFiltered: boolean;
  endYear: number;
  endMonth: number;
}) {
  const months = getTrailingMonths(endYear, endMonth);

  const totalsByMonth = months.map((m) =>
    rows.reduce(
      (sum, r) => (r.month === m ? sum + r.revenue : sum),
      0
    )
  );

  const ttmTotal = totalsByMonth.reduce((a, b) => a + b, 0);

  let products: any[] = [];

  /* ---------- BUILD ROWS ---------- */

  if (isFiltered) {
    products = Object.values(
      rows.reduce<Record<string, any>>((acc, r) => {
        const key = `${r.productnum}|${r.display_name}`;
        if (!acc[key]) {
          acc[key] = {
            key,
            productnum: r.productnum,
            display_name: r.display_name,
            fragrance: r.fragrance,
            byMonth: {},
          };
        }
        acc[key].byMonth[r.month] =
          (acc[key].byMonth[r.month] ?? 0) + r.revenue;
        return acc;
      }, {})
    );
  } else {
    const totalsByName = Object.values(
      rows.reduce<Record<string, { name: string; total: number }>>(
        (acc, r) => {
          const name = r.display_name ?? "Unknown";
          if (!acc[name]) acc[name] = { name, total: 0 };
          acc[name].total += r.revenue;
          return acc;
        },
        {}
      )
    );

    const top10 = new Set(
      totalsByName
        .sort((a, b) => b.total - a.total)
        .slice(0, 16)
        .map((p) => p.name)
    );

    products = Object.values(
      rows.reduce<Record<string, any>>((acc, r) => {
        const name = r.display_name ?? "Unknown";
        const key = top10.has(name) ? name : "__OTHER__";
        if (!acc[key]) {
          acc[key] = {
            key,
            label: key === "__OTHER__" ? "Other" : name,
            byMonth: {},
          };
        }
        acc[key].byMonth[r.month] =
          (acc[key].byMonth[r.month] ?? 0) + r.revenue;
        return acc;
      }, {})
    );
  }

  /* ---------- SORTING ---------- */

  const normalItems = products
    .filter((p) => !isOtherRow(p))
    .sort(
      (a, b) =>
        rowTTM(months, b.byMonth) -
        rowTTM(months, a.byMonth)
    );

  const otherItems = products.filter(isOtherRow);
  const sortedProducts = [...normalItems, ...otherItems];

  /* ---------- RENDER ---------- */

  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200/60">
      <table
        className="min-w-max w-full text-xs table-fixed"
      >
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {/* FIXED WIDTH PRODUCT COLUMN */}
            <th
              className="sticky left-0 bg-gray-50 px-2 py-1 text-left"
              style={{ width: 260 }}
            >
              Sales by Product Name
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
          {/* PRODUCTS */}
          {sortedProducts.map((p) => {
            const ttm = rowTTM(months, p.byMonth);

            return (
              <tr key={p.key} className="hover:bg-gray-50">
                {/* FIXED WIDTH CELL */}
                <td
                  className="sticky left-0 bg-white px-2 py-1 align-top"
                  style={{ width: 260 }}
                >
                  {isFiltered ? (
                  <div className="space-y-0.5 text-xs leading-snug">
                    {/* PRODUCT CODE */}
                    <div className="font-mono text-gray-500 truncate">
                      {p.productnum}
                    </div>

                    {/* DISPLAY NAME */}
                    <div className="font-medium break-words whitespace-normal">
                      {p.display_name ?? "—"}
                    </div>

                    {/* FRAGRANCE */}
                    {p.fragrance && (
                      <div className="font-medium break-words whitespace-normal">
                        {p.fragrance}
                      </div>
                    )}
                  </div>
                  ) : (
                    <div className="break-words whitespace-normal">
                      {p.label}
                    </div>
                  )}
                </td>

                {months.map((m) => (
                  <td key={m} className="px-2 py-1 text-right">
                    {p.byMonth[m]
                      ? p.byMonth[m].toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </td>
                ))}

                <td className="px-2 py-1 text-right font-medium">
                  {ttm.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </td>
              </tr>
            );
          })}

          {/* TOTAL SALES – ALWAYS LAST */}
          <tr className="bg-gray-100">
            <td
              className="sticky left-0 bg-gray-100 px-2 py-1 font-semibold"
              style={{ width: 260 }}
            >
              Total Sales
            </td>

            {totalsByMonth.map((v, i) => (
              <td key={i} className="px-2 py-1 text-right">
                {v.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </td>
            ))}

            <td className="px-2 py-1 text-right font-semibold">
              {ttmTotal.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
