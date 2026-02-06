"use client";

export default function MarketingOverviewPage() {
  return (
    <div className="space-y-10">
      {/* Shopify Overview */}
      <section>
        <h2 className="text-lg font-medium mb-4">
          Shopify Performance
        </h2>
      </section>

      {/* Upcoming Content */}
      <section className="rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-medium mb-4">
          Upcoming Content
        </h2>

        <p className="text-sm text-gray-500">
          No content scheduled yet.
        </p>
      </section>

      {/* Social placeholder */}
      <section className="rounded-2xl border border-dashed border-gray-200 p-6 text-gray-500">
        <p className="text-sm">
          Social media analytics will appear here once connected.
        </p>
      </section>
    </div>
  );
}
