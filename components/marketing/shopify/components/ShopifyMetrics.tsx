// /shopify/components/ShopifyMetrics.tsx
import { n } from "./normalize";

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-medium text-gray-900">
        {value}
      </div>
    </div>
  );
}

export function ShopifyMetrics({ data }: { data: any }) {
  return (
    <>
      {/* Funnel Volume */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <MetricCard
          label="Visitors"
          value={n(data.online_store_visitors).toLocaleString()}
        />
        <MetricCard
          label="Sessions"
          value={n(data.sessions).toLocaleString()}
        />
        <MetricCard
          label="Reached Checkout"
          value={n(
            data.sessions_reached_checkout
          ).toLocaleString()}
        />
        <MetricCard
          label="Orders"
          value={n(data.total_orders).toLocaleString()}
        />
      </section>

      {/* Funnel Efficiency */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <MetricCard
          label="Conversion Rate"
          value={`${(n(data.conversion_rate) * 100).toFixed(2)}%`}
        />
        <MetricCard
          label="Avg Order Value"
          value={`$${n(
            data.total_amount_spent_per_order
          ).toFixed(2)}`}
        />
        <MetricCard
          label="Revenue"
          value={`$${n(
            data.total_amount_spent
          ).toLocaleString()}`}
        />
        <MetricCard
          label="Shipping"
          value={`$${n(
            data.total_shipping_charges
          ).toLocaleString()}`}
        />
      </section>
    </>
  );
}
