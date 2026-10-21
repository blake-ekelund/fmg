"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { SITE_BRANDS, sitePagesFor, type SiteBrand } from "@/lib/site/registry";
import { call, fetchStatuses, when, type PageStatus } from "./siteApi";

/**
 * Website home — every editable page of a store as a card (a live picture
 * of the draft, and whether it's live), grouped like the site's menu. With
 * the top switch on All, both stores stack. "Publish all changes" puts every
 * page with unpublished edits live in one go.
 */
export default function SiteHome({
  brands,
  onOpen,
}: {
  brands: SiteBrand[];
  onOpen: (brand: SiteBrand, slug: string) => void;
}) {
  return (
    <div className="w-full space-y-10 p-6 md:px-8">
      {brands.map((b) => (
        <StoreSection key={b} brand={b} onOpen={(slug) => onOpen(b, slug)} />
      ))}
    </div>
  );
}

type Status = "live" | "changes" | "draft" | "original";

function statusOf(st: PageStatus | undefined): Status {
  if (!st?.updatedAt) return "original";
  if (!st.publishedAt) return "draft";
  return st.unpublished ? "changes" : "live";
}

const STATUS_PILL: Record<Status, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-emerald-50 text-emerald-700" },
  changes: { label: "Changes not live", cls: "bg-amber-50 text-amber-700" },
  draft: { label: "Draft — not live yet", cls: "bg-amber-50 text-amber-700" },
  original: { label: "Original", cls: "bg-gray-100 text-gray-500" },
};

function StoreSection({ brand, onOpen }: { brand: SiteBrand; onOpen: (slug: string) => void }) {
  const store = SITE_BRANDS.find((x) => x.brand === brand)!;
  const pages = sitePagesFor(brand);
  const groups = [...new Set(pages.map((p) => p.group))];
  const [statuses, setStatuses] = useState<PageStatus[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetchStatuses(brand).then((s) => {
      if (!alive) return;
      setFailed(!s);
      setStatuses(s ?? []);
    });
    return () => {
      alive = false;
    };
  }, [brand, tick]);

  const byslug = new Map((statuses ?? []).map((s) => [s.slug, s]));
  const pending = pages.filter((p) => byslug.get(p.slug)?.unpublished);

  async function publishAll() {
    if (!pending.length) return;
    if (!confirm(`Put ${pending.length} ${pending.length === 1 ? "page" : "pages"} live on ${store.host}?\n\n${pending.map((p) => `• ${p.label}`).join("\n")}`)) return;
    setMessage(null);
    const errors: string[] = [];
    for (let i = 0; i < pending.length; i++) {
      setPublishing({ done: i, total: pending.length });
      try {
        await call(brand, pending[i].slug, "POST", { action: "publish" });
      } catch (e) {
        errors.push(`${pending[i].label}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setPublishing(null);
    setMessage(
      errors.length
        ? { tone: "error", text: `${pending.length - errors.length} of ${pending.length} published. ${errors.join(" · ")}` }
        : { tone: "ok", text: `${pending.length} ${pending.length === 1 ? "page is" : "pages are"} live — the site picks them up within a minute.` },
    );
    load();
  }

  return (
    <section>
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{store.label}</h2>
          <a
            href={`https://${store.host}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            {store.host} <ExternalLink size={11} />
          </a>
        </div>
        {statuses && !failed ? (
          <span className={clsx("text-xs", pending.length ? "text-amber-700" : "text-gray-500")}>
            {pending.length
              ? `${pending.length} ${pending.length === 1 ? "page has" : "pages have"} changes that aren't live`
              : "Everything is live"}
          </span>
        ) : null}
        <button
          type="button"
          disabled={!pending.length || !!publishing}
          onClick={publishAll}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
        >
          {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {publishing ? `Publishing ${publishing.done + 1} of ${publishing.total}…` : "Publish all changes"}
        </button>
      </header>

      {message ? (
        <div
          className={clsx(
            "mb-4 rounded-lg px-4 py-2.5 text-sm",
            message.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
          )}
        >
          {message.text}
        </div>
      ) : null}
      {failed ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Couldn&apos;t load which pages are live — you can still open and edit them.
        </div>
      ) : null}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g}>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{g}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {pages
                .filter((p) => p.group === g)
                .map((p) => {
                  const st = byslug.get(p.slug);
                  const s = statusOf(st);
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => onOpen(p.slug)}
                      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                    >
                      <Thumb src={st?.previewUrl ?? null} label={p.label} />
                      <div className="flex flex-1 flex-col gap-1 border-t border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-900">{p.label}</span>
                          {statuses && !failed ? (
                            <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_PILL[s].cls)}>
                              {STATUS_PILL[s].label}
                            </span>
                          ) : null}
                        </div>
                        <span className="truncate text-[11px] text-gray-400">{p.path.trim().startsWith("/") ? p.path : "Every page"}</span>
                        {st?.publishedAt ? (
                          <span className="text-[11px] text-gray-400">Published {when(st.publishedAt)}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The page's draft, drawn small: a desktop-width frame scaled to the card. */
function Thumb({ src, label }: { src: string | null; label: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative aspect-[4/3] w-full overflow-hidden bg-gray-50">
      {src ? (
        <iframe
          src={`${src}&bare=1`}
          title={`${label} preview`}
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          aria-hidden
          onLoad={() => setLoaded(true)}
          className={clsx("pointer-events-none absolute left-0 top-0 origin-top-left border-0 transition-opacity", loaded ? "opacity-100" : "opacity-0")}
          style={{ width: 1280, height: 960, transform: `scale(${scale})` }}
        />
      ) : null}
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-300">
          {src ? <Loader2 size={14} className="animate-spin" /> : "No preview"}
        </div>
      ) : null}
    </div>
  );
}
