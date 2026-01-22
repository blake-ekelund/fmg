import { Stat } from "@/components/sales/Stat";
import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";

export default function MarketingPage() {
  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header + Period */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Marketing
          </h1>
          <p className="mt-3 text-gray-500 max-w-xl">
            Measure attention, engagement, and how it converts to sales.
          </p>
        </div>

        <PeriodSelector />
      </header>

      {/* KPI Section */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Web Sessions" value="128,420" />
        <Stat label="Orders" value="3,842" />
        <Stat label="Sales" value="$51,230" />
        <Stat label="Conversion Rate" value="2.99%" />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Followers" value="+2,140" />
        <Stat label="Views" value="214,900" />
        <Stat label="Comments" value="4,820" />
        <Stat label="Referrals to Site" value="6,310" />
      </section>

      {/* Content Calendar */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-2">
          Content Calendar (Next 30 Days)
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Planned posts, launches, and campaigns.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CalendarItem
            date="Aug 1"
            channel="Instagram"
            description="Product highlight — Bestie"
          />
          <CalendarItem
            date="Aug 4"
            channel="TikTok"
            description="Behind the scenes — production"
          />
          <CalendarItem
            date="Aug 8"
            channel="Email"
            description="August promo launch"
          />
          <CalendarItem
            date="Aug 12"
            channel="Instagram"
            description="UGC repost + giveaway"
          />
        </div>
      </section>

      {/* Top Performing Content */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Top Performing Content
        </h2>

        <Table>
          <TableRow
            name="TikTok: 'How we make Hot Mess'"
            value="92,400 views"
            secondary="1,240 site visits"
            accent="green"
          />
          <TableRow
            name="Instagram Reel: Bestie Launch"
            value="61,800 views"
            secondary="840 site visits"
            accent="green"
          />
          <TableRow
            name="Email: Summer Drop"
            value="28% open rate"
            secondary="420 orders"
            accent="orange"
          />
        </Table>
      </section>

      {/* Attribution Summary */}
      <section className="border border-gray-200 rounded-2xl p-6">
        <h2 className="text-lg font-medium mb-4">
          Traffic → Sales Attribution
        </h2>

        <Table>
          <TableRow
            name="Social Media"
            value="$18,420"
            secondary="36% of total sales"
          />
          <TableRow
            name="Email"
            value="$14,300"
            secondary="28% of total sales"
          />
          <TableRow
            name="Direct / Organic"
            value="$11,180"
            secondary="22% of total sales"
          />
          <TableRow
            name="Other"
            value="$7,330"
            secondary="14% of total sales"
          />
        </Table>
      </section>
    </div>
  );
}

/* ---------------------------------------------
   Period Selector (shared pattern)
--------------------------------------------- */
function PeriodSelector() {
  const periods = ["Month", "Quarter", "YTD", "Trailing 12 Months"];

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
   Calendar Item
--------------------------------------------- */
function CalendarItem({
  date,
  channel,
  description,
}: {
  date: string;
  channel: string;
  description: string;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="text-sm font-medium">{date}</div>
      <div className="text-xs text-gray-500 mt-1">
        {channel}
      </div>
      <div className="mt-2 text-sm">
        {description}
      </div>
    </div>
  );
}
