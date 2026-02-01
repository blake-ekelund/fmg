import { Lock } from "lucide-react";

function PlaceholderStat({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 bg-gray-50">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-gray-400">
        <Lock size={14} />
        <span className="text-lg font-medium">Coming soon</span>
      </div>
    </div>
  );
}

function PlaceholderTableRow({
  name,
  note,
}: {
  name: string;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm text-gray-400">
      <div>{name}</div>
      <div className="flex items-center gap-2">
        <Lock size={14} />
        <span>{note ?? "Coming soon"}</span>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="px-8 py-10 space-y-12">
      {/* Header */}
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">
          Overview
        </h1>
        <p className="mt-3 text-gray-500 max-w-xl">
          A unified snapshot of sales, inventory, marketing, and customers.
        </p>
      </header>

      {/* Coming Soon Callout */}
      <div className="rounded-2xl border border-dashed border-gray-300 p-6 bg-gray-50">
        <h2 className="text-lg font-medium mb-1">
          Overview dashboard — coming soon
        </h2>
        <p className="text-sm text-gray-500 max-w-xl">
          This page will bring together live signals from sales, inventory,
          marketing, and customer health. The structure is in place —
          metrics will activate as integrations roll out.
        </p>
      </div>

    </div>
  );
}
