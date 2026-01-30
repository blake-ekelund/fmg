// /marketing/overview/page.tsx
"use client";

import { Stat } from "@/components/sales/Stat";
import { Table } from "@/components/sales/Table";
import { TableRow } from "@/components/sales/TableRow";
import { useMarketingOverview } from "./hooks/useMarketingOverview";
import { formatDelta } from "./utils/formatDelta";

/**
 * Safely derive trend from a nullable delta
 */
function trendFromDelta(
  value: number | null
): "up" | "down" | "flat" {
  if (value === null) return "flat";
  return value >= 0 ? "up" : "down";
}

export default function MarketingOverviewPage() {
  const { shopify, upcomingContent, loading } =
    useMarketingOverview();

  if (loading) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }

  if (!shopify) {
    return (
      <div className="text-sm text-gray-500">
        No Shopify data available.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Shopify Overview */}
      <section>
        <h2 className="text-lg font-medium mb-4">
          Shopify Performance (Last 30 Days)
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Stat
            label="Sessions"
            value={shopify.current.sessions.toLocaleString()}
            delta={formatDelta(shopify.delta.sessions)}
            trend={trendFromDelta(shopify.delta.sessions)}
            helper="vs prior 30 days"
          />

          <Stat
            label="Orders"
            value={shopify.current.orders.toLocaleString()}
            delta={formatDelta(shopify.delta.orders)}
            trend={trendFromDelta(shopify.delta.orders)}
            helper="vs prior 30 days"
          />

          <Stat
            label="Revenue"
            value={`$${shopify.current.revenue.toLocaleString()}`}
            delta={formatDelta(shopify.delta.revenue)}
            trend={trendFromDelta(shopify.delta.revenue)}
            helper="vs prior 30 days"
          />

          <Stat
            label="Conversion Rate"
            value={`${(shopify.current.conversion * 100).toFixed(2)}%`}
            delta={formatDelta(
              shopify.delta.conversion,
              "points"
            )}
            trend={trendFromDelta(shopify.delta.conversion)}
            helper="vs prior 30 days"
          />
        </div>
      </section>

      {/* Upcoming Content */}
      <section className="rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-medium mb-4">
          Upcoming Content (Next 7 Days)
        </h2>

        {upcomingContent.length === 0 ? (
          <p className="text-sm text-gray-500">
            No content scheduled in the next 7 days.
          </p>
        ) : (
          <Table>
            {upcomingContent.map((item) => (
              <TableRow
                key={item.id}
                name={`${item.publish_date} · ${item.platform}`}
                value={item.description}
                secondary={item.status}
                accent={
                  item.status === "Scheduled"
                    ? "orange"
                    : undefined
                }
              />
            ))}
          </Table>
        )}
      </section>

      {/* Social placeholder */}
      <section className="rounded-2xl border border-dashed border-gray-200 p-6 text-gray-500">
        <p className="text-sm">
          Social media analytics will appear here once
          connected.
        </p>
      </section>
    </div>
  );
}
