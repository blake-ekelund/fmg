"use client";

import { Activity, ExternalLink, Eye, MousePointerClick, ShoppingBag } from "lucide-react";

/**
 * Web analytics for the storefronts. The sites don't emit analytics events
 * yet, so this page is an honest scaffold: it shows the dashboard shape and
 * spells out the two activation paths instead of pretending with numbers.
 */
export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Web analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Traffic and conversion for redek.io and naturalinspirations.com.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="font-medium">Not collecting yet.</span> The
        storefronts don't emit analytics events. Two ways to light this up —
        (1) enable Vercel Web Analytics on both storefront projects (one
        toggle each, dashboards live on vercel.com), or (2) add a
        first-party pageview beacon to the storefronts that writes into
        this database so this page can render everything in-house. Say the
        word and either can be wired.
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Pageviews (7d)", Icon: Eye },
          { label: "Unique visitors (7d)", Icon: Activity },
          { label: "Add-to-cart events", Icon: MousePointerClick },
          { label: "Checkout conversions", Icon: ShoppingBag },
        ].map(({ label, Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">
              <Icon size={12} />
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-300">
              —
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          {
            brand: "Sassy",
            chip: "bg-pink-50 text-pink-700 border-pink-200",
            url: "redek.io",
          },
          {
            brand: "Natural Inspirations",
            chip: "bg-blue-50 text-blue-700 border-blue-200",
            url: "naturalinspirations.com",
          },
        ].map((b) => (
          <div
            key={b.brand}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${b.chip}`}
              >
                {b.brand}
              </span>
              <a
                href={`https://${b.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
              >
                {b.url} <ExternalLink size={11} />
              </a>
            </div>
            <div className="mt-4 space-y-2">
              {["Top pages", "Top products", "Traffic sources"].map((row) => (
                <div
                  key={row}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm last:border-0"
                >
                  <span className="text-gray-500">{row}</span>
                  <span className="text-gray-300">awaiting data</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
