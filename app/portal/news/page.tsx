"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "@/components/portal/icons";
import { portalGet, shortDate, type PortalNews } from "@/components/portal/api";

/**
 * What's New — a rep-facing feed of FMG / Natural Inspirations / Sassy
 * announcements (new products, launches, promos, press, portal updates). Same
 * for every rep; content comes from the portal_news table via /api/portal/news.
 */

const BRAND_LABEL: Record<string, string> = {
  FMG: "FMG",
  NI: "Natural Inspirations",
  Sassy: "Sassy",
};

const CATEGORY_TONE: Record<string, string> = {
  "New Product": "bg-emerald-50 text-emerald-700",
  Launch: "bg-emerald-50 text-emerald-700",
  Promotion: "bg-amber-50 text-amber-700",
  Press: "bg-blue-50 text-blue-700",
  Update: "bg-gray-100 text-gray-600",
};

function brandLabel(b: string): string {
  return BRAND_LABEL[b] ?? b;
}

export default function PortalNewsPage() {
  const [news, setNews] = useState<PortalNews[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<string>("all");

  useEffect(() => {
    portalGet<{ news: PortalNews[] }>("/api/portal/news")
      .then((d) => setNews(d.news))
      .catch((e) => setError(e.message));
  }, []);

  // Offer only the brands that actually have posts.
  const brands = useMemo(() => {
    if (!news) return [];
    const set = new Set(news.map((n) => n.brand));
    return ["FMG", "NI", "Sassy"].filter((b) => set.has(b));
  }, [news]);

  const shown = useMemo(
    () => (news ?? []).filter((n) => brand === "all" || n.brand === brand),
    [news, brand],
  );

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          What&apos;s New
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          New products, launches, and updates across FMG, Natural Inspirations,
          and Sassy.
        </p>
      </div>

      {brands.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ v: "all", label: "All" }, ...brands.map((b) => ({ v: b, label: brandLabel(b) }))].map(
            (f) => {
              const active = brand === f.v;
              return (
                <button
                  key={f.v}
                  onClick={() => setBrand(f.v)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {f.label}
                </button>
              );
            },
          )}
        </div>
      )}

      {!news ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50 text-gray-400">
            <Megaphone size={20} />
          </span>
          <p className="text-sm text-gray-500">
            No updates here yet — check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsCard({ item }: { item: PortalNews }) {
  const tone = CATEGORY_TONE[item.category] ?? "bg-gray-100 text-gray-600";
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        {item.image_url && (
          <img
            src={item.image_url}
            alt=""
            className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-28 sm:w-40"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${tone}`}>
              {item.category}
            </span>
            <span className="text-gray-400">{brandLabel(item.brand)}</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400">{shortDate(item.published_at)}</span>
          </div>
          <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
          {item.summary && (
            <p className="mt-1 text-sm leading-relaxed text-gray-600">{item.summary}</p>
          )}
          {item.body && (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {item.body}
            </p>
          )}
          {item.link_url && (
            <a
              href={item.link_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
            >
              Read more →
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
