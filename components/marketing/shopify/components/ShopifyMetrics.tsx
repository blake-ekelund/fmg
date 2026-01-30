// /shopify/components/ShopifyMetrics.tsx
import { Stat } from "@/components/sales/Stat";
import { n } from "./normalize";

export function ShopifyMetrics({ data }: { data: any }) {
  return (
    <>
      {/* Funnel Volume */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat
          label="Visitors"
          value={n(data.online_store_visitors).toLocaleString()}
        />
        <Stat
          label="Sessions"
          value={n(data.sessions).toLocaleString()}
        />
        <Stat
          label="Reached Checkout"
          value={n(data.sessions_reached_checkout).toLocaleString()}
        />
        <Stat
          label="Orders"
          value={n(data.total_orders).toLocaleString()}
        />
      </section>

      {/* Funnel Efficiency */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat
          label="Conversion Rate"
          value={`${(n(data.conversion_rate) * 100).toFixed(2)}%`}
        />
        <Stat
          label="Avg Order Value"
          value={`$${n(
            data.total_amount_spent_per_order
          ).toFixed(2)}`}
        />
        <Stat
          label="Revenue"
          value={`$${n(data.total_amount_spent).toLocaleString()}`}
        />
        <Stat
          label="Shipping"
          value={`$${n(data.total_shipping_charges).toLocaleString()}`}
        />
      </section>
    </>
  );
}
