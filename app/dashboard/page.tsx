import { Lock } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

function PlaceholderStat({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 bg-white">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-gray-400">
        <Lock size={14} />
        <span className="text-lg font-medium">Coming soon</span>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      <PageHeader
        title="Overview"
        subtitle="A unified snapshot of sales, inventory, marketing, and customers."
      />

      {/* Coming Soon Callout */}
      <div className="rounded-2xl border border-dashed border-gray-300 p-6 bg-white">
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
