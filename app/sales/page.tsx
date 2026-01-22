import { Stat } from "@/components/sales/Stat";
import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";

export default function SalesPage() {
  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Sales
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl">
            Performance across vans, products, and time.
          </p>
        </div>

        {/* Period Selector */}
        <PeriodSelector />
      </header>

      {/* Filters */}
      <FiltersRow />

      {/* KPI Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Total Sales" value="$42,380" />
        <Stat label="Units Sold" value="3,128" />
        <Stat label="Avg. Order Value" value="$13.55" />
        <Stat label="Best Day" value="Saturday" />
      </section>

      {/* Sales Trend */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-2">
          Sales Trend
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Daily sales over time (chart coming soon).
        </p>

        <div className="h-40 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-sm">
          Chart placeholder
        </div>
      </section>

      {/* Sales by Van */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Sales by Van
        </h2>

        <Table>
          <TableRow name="Van 01" value="$12,430" secondary="932 units" />
          <TableRow name="Van 02" value="$10,980" secondary="814 units" />
          <TableRow name="Van 03" value="$9,540" secondary="702 units" />
          <TableRow name="Van 04" value="$9,430" secondary="680 units" />
        </Table>
      </section>

      {/* Top Products */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Top Products
        </h2>

        <Table>
          <TableRow name="Bestie" value="$8,320" secondary="612 units" accent="pink" />
          <TableRow name="Bougie Babe" value="$7,940" secondary="586 units" accent="green" />
          <TableRow name="Hot Mess" value="$6,710" secondary="498 units" accent="orange" />
        </Table>
      </section>
    </div>
  );
}

/* ---------------------------------------------
   Period Selector (placeholder)
--------------------------------------------- */
function PeriodSelector() {
  const periods = ["Month", "Quarter", "YTD", "TTM"];

  return (
    <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white">
      {periods.map((period, idx) => (
        <button
          key={period}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            idx === 0
              ? "bg-gray-100 text-black"
              : "text-gray-500 hover:text-black"
          }`}
        >
          {period}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------
   Filters Row (placeholders)
--------------------------------------------- */
function FiltersRow() {
  return (
    <section className="flex flex-col md:flex-row md:items-center gap-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search (SKU, Product Name, Fragrance, or Description)"
        className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
      />

      {/* Product */}
      <select
        defaultValue=""
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="" disabled>
          Product
        </option>
        <option>Hand Cream</option>
        <option>Body Butter</option>
        <option>Lip Butter</option>
      </select>

      {/* Fragrance */}
      <select
        defaultValue=""
        className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
      >
        <option value="" disabled>
          Fragrance
        </option>
        <option>Vanilla</option>
        <option>Coconut</option>
        <option>Lavender</option>
        <option>Citrus</option>
      </select>
    </section>
  );
}
