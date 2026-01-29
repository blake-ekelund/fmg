import { Stat } from "@/components/sales/Stat";
import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";

export default function OverviewPage() {
  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header */}
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">
          Overview
        </h1>
        <p className="mt-3 text-gray-500 max-w-xl">
          A real-time snapshot of sales, inventory, marketing, and customers.
        </p>
      </header>

      {/* Top-line KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Sales (MTD)" value="$84,120" />
        <Stat label="Orders (MTD)" value="6,210" />
        <Stat label="Gross Margin" value="62%" />
        <Stat label="Cash Collected" value="$71,480" />
      </section>

      {/* Sales + Inventory */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Snapshot */}
        <div className="border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-2">
            Sales Snapshot
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Recent performance across vans and products.
          </p>

          <Table>
            <TableRow
              name="Bestie"
              value="$18,420"
              secondary="Top product"
              accent="green"
            />
            <TableRow
              name="Van 01"
              value="$21,980"
              secondary="Top van"
              accent="green"
            />
            <TableRow
              name="Avg. Order Value"
              value="$13.55"
              secondary="Stable"
            />
          </Table>
        </div>

        {/* Inventory Risk */}
        <div className="border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-2">
            Inventory Risk
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Finished goods and BOM constraints.
          </p>

          <Table>
            <TableRow
              name="Low Stock SKUs"
              value="6"
              secondary="Reorder soon"
              accent="orange"
            />
            <TableRow
              name="Out of Stock Risk"
              value="2 SKUs"
              secondary="Critical"
              accent="pink"
            />
            <TableRow
              name="BOM Materials at Risk"
              value="4"
              secondary="Production impact"
              accent="orange"
            />
          </Table>
        </div>
      </section>

      {/* Marketing + Customers */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Marketing Effectiveness */}
        <div className="border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-2">
            Marketing Effectiveness
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Attention → traffic → sales.
          </p>

          <Table>
            <TableRow
              name="Web Conversion Rate"
              value="2.99%"
              secondary="Healthy"
              accent="green"
            />
            <TableRow
              name="Top Channel"
              value="Social"
              secondary="$18,420 sales"
            />
            <TableRow
              name="Email Performance"
              value="28% open rate"
              secondary="Above average"
              accent="green"
            />
          </Table>
        </div>

        {/* Customer Health */}
        <div className="border border-gray-200 rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-2">
            Customer Health
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Retention and churn signals.
          </p>

          <Table>
            <TableRow
              name="New Customers (60d)"
              value="42"
              secondary="Growing"
              accent="green"
            />
            <TableRow
              name="Warning Customers (180d)"
              value="18"
              secondary="Needs attention"
              accent="orange"
            />
            <TableRow
              name="Lost Customers (365d)"
              value="9"
              secondary="Follow-up needed"
              accent="pink"
            />
          </Table>
        </div>
      </section>
    </div>
  );
}
