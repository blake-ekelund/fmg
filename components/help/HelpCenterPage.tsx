"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Search, Sparkles, ArrowRight } from "lucide-react";
import { useUser } from "@/components/UserContext";
import { guideForRole, type GuideEntry } from "@/lib/help";
import { isAppPath, renderMarkdown } from "@/lib/help/markdown";
import { openHelpAssistant } from "@/components/HelpAssistant";

/**
 * /help — the user guide, browsable. Same content Sage answers
 * from (lib/help), filtered to the pages the viewer's role can open.
 * ?page=<path> selects an entry.
 */
export default function HelpCenterPage() {
  const { profile } = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");

  const entries = useMemo(() => (profile ? guideForRole(profile.access) : []), [profile]);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return entries;
    return entries.filter((g) => {
      const hay = `${g.title} ${g.section} ${g.summary} ${g.body}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [entries, query]);

  const grouped = useMemo(() => {
    const out = new Map<string, GuideEntry[]>();
    for (const g of filtered) {
      const k = g.section || "General";
      out.set(k, [...(out.get(k) ?? []), g]);
    }
    return [...out.entries()];
  }, [filtered]);

  const selectedPath = params.get("page");
  const selected = filtered.find((g) => g.path === selectedPath) ?? filtered[0] ?? null;
  const select = (g: GuideEntry) => router.replace(`/help?page=${encodeURIComponent(g.path)}`, { scroll: false });

  /* Links inside the guide go to the real page. */
  function onBodyClick(e: React.MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !isAppPath(href)) return;
    e.preventDefault();
    router.push(href);
  }

  const openable = selected && !selected.path.includes("[") ? selected.path.split("#")[0] : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <BookOpen size={20} className="text-brand-700" /> Help &amp; User Guide
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            How every page works, with step-by-step instructions. Can&apos;t find it? Ask Sage.
          </p>
        </div>
        <button
          onClick={() => openHelpAssistant()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Sparkles size={15} /> Ask Sage
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the guide…"
              className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-700/10"
            />
          </div>
          <nav className="max-h-[70vh] space-y-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3">
            {grouped.length === 0 && <p className="px-2 py-1 text-sm text-ink-muted">No pages match “{query}”.</p>}
            {grouped.map(([section, items]) => (
              <div key={section}>
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{section}</div>
                {items.map((g) => (
                  <button
                    key={g.path}
                    onClick={() => select(g)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                      selected?.path === g.path
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-secondary hover:bg-surface-muted hover:text-ink"
                    }`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {selected && (
          <article className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{selected.section || "General"}</div>
                <h2 className="mt-0.5 text-lg font-semibold text-ink">{selected.title}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{selected.summary}</p>
              </div>
              {openable && (
                <button
                  onClick={() => router.push(openable)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-secondary hover:bg-surface-muted hover:text-ink"
                >
                  Go to page <ArrowRight size={14} />
                </button>
              )}
            </div>
            <div
              onClick={onBodyClick}
              className="max-w-3xl space-y-2 text-sm leading-relaxed text-ink [&_ol]:my-2 [&_strong]:font-semibold [&_ul]:my-2"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.body) }}
            />
          </article>
        )}
      </div>
    </div>
  );
}
