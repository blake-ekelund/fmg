"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Copy, ExternalLink, Heart, Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { UnsplashPhoto, UnsplashSourceInfo } from "@/lib/unsplash";

/**
 * Marketing → Photography: our brand collections on Unsplash (Sassy, NI) plus
 * any photographers in UNSPLASH_PHOTOGRAPHERS, browsable in one place. Same API as the
 * image picker's Unsplash tab (/api/images/unsplash); copying a photo's URL
 * counts as a use, so it pings Unsplash's download tracker like a pick does.
 */

type Resp = {
  configured?: boolean;
  sources?: { key: string; label: string }[];
  photos?: UnsplashPhoto[];
  hasMore?: boolean;
  info?: UnsplashSourceInfo[];
  errors?: { key: string; label: string; message: string }[];
  error?: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function trackUse(p: UnsplashPhoto) {
  void authHeader().then((headers) =>
    fetch("/api/images/unsplash", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ downloadLocation: p.downloadLocation }),
    }).catch(() => {}),
  );
}

const fmt = (n: number) => n.toLocaleString();

export default function PhotographyPage() {
  const [info, setInfo] = useState<UnsplashSourceInfo[]>([]);
  const [sources, setSources] = useState<{ key: string; label: string }[]>([]);
  const [source, setSource] = useState("");
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<UnsplashPhoto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(page) });
        if (source) qs.set("source", source);
        // Source cards only on the first unfiltered load — they don't change per page.
        if (page === 1 && !source && info.length === 0) qs.set("info", "1");
        const res = await fetch(`/api/images/unsplash?${qs}`, { headers: await authHeader() });
        const json = (await res.json().catch(() => ({}))) as Resp;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Couldn't load photos.");
          return;
        }
        setConfigured(json.configured !== false);
        setSources(json.sources ?? []);
        setSourceErrors((json.errors ?? []).map((e) => `${e.label}: ${e.message}`));
        if (json.info) setInfo(json.info);
        setPhotos((prev) => (page === 1 ? (json.photos ?? []) : [...prev, ...(json.photos ?? [])]));
        setHasMore(Boolean(json.hasMore));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load photos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- info is a load-once cache
  }, [page, source]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? photos.filter((p) => `${p.alt ?? ""} ${p.description ?? ""} ${p.photographer.name}`.toLowerCase().includes(q))
    : photos;

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Photography</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Our Sassy and Natural Inspirations photo collections on Unsplash — the same photos the email
          and blog image pickers offer under “Unsplash”. Copy a photo&apos;s URL to use it anywhere; always credit
          the photographer where it appears.
        </p>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Camera size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-600">Unsplash isn&apos;t connected yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
            Set UNSPLASH_ACCESS_KEY in the server environment.
          </p>
        </div>
      ) : (
        <>
          {/* Sources — click a card to show only its photos */}
          {info.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {info.map((s) => (
                <div
                  key={s.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSource(source === s.key ? "" : s.key);
                    setPage(1);
                  }}
                  className={`flex cursor-pointer gap-3 rounded-2xl border bg-white p-4 text-left transition ${
                    source === s.key ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image}
                      alt=""
                      className={`h-14 w-14 shrink-0 object-cover ${s.kind === "user" ? "rounded-full" : "rounded-xl"}`}
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                      <Camera size={20} className="text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-gray-900">{s.label}</p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-gray-700"
                        title="Open on Unsplash"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    {s.subtitle && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                        {s.kind === "user" && <MapPin size={10} />} {s.subtitle}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-900">{fmt(s.totalPhotos)}</span> photos
                    </p>
                    {s.description && <p className="mt-1.5 line-clamp-2 text-xs text-gray-500">{s.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-sm flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search descriptions…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>
            {sources.length > 1 &&
              [{ key: "", label: "All" }, ...sources].map((s) => (
                <button
                  key={s.key || "all"}
                  onClick={() => {
                    setSource(s.key);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    source === s.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            <span className="ml-auto text-xs text-gray-400">
              {q ? `${filtered.length} of ${photos.length} loaded` : `${photos.length} loaded`}
            </span>
          </div>

          {sourceErrors.map((m) => (
            <div key={m} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{m}</div>
          ))}
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {/* Grid */}
          {loading && photos.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Loading photos…
            </div>
          ) : filtered.length === 0 && !error ? (
            <div className="py-24 text-center text-sm text-gray-500">
              {photos.length === 0 ? "No photos published yet." : "No matches in the photos loaded so far."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setOpen(p)}
                  className="group relative aspect-[4/5] overflow-hidden rounded-xl"
                  style={{ backgroundColor: p.color ?? "#f3f4f6" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb} alt={p.alt ?? ""} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-left text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                    {p.photographer.name}
                  </div>
                </button>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={() => setPage((n) => n + 1)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loading && <Loader2 size={14} className="animate-spin" />} Load more
              </button>
            </div>
          )}
        </>
      )}

      {open && <PhotoDetail photo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PhotoDetail({ photo: p, onClose }: { photo: UnsplashPhoto; onClose: () => void }) {
  const [copied, setCopied] = useState<"url" | "credit" | null>(null);
  const credit = `Photo by ${p.photographer.name} on Unsplash`;

  async function copy(kind: "url" | "credit") {
    await navigator.clipboard.writeText(kind === "url" ? p.url : credit);
    if (kind === "url") trackUse(p);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center" style={{ backgroundColor: p.color ?? "#111827" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.alt ?? ""} className="max-h-[60vh] w-full object-contain md:max-h-[90vh]" />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 md:w-72">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{p.photographer.name}</p>
              <p className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {(p.description || p.alt) && <p className="text-sm text-gray-700">{p.description ?? p.alt}</p>}

          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-gray-400">Original size</dt>
              <dd className="font-medium text-gray-800">{p.width} × {p.height}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Likes</dt>
              <dd className="flex items-center gap-1 font-medium text-gray-800">
                <Heart size={11} /> {fmt(p.likes)}
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <button
              onClick={() => copy("url")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {copied === "url" ? <Check size={14} /> : <Copy size={14} />} {copied === "url" ? "Copied" : "Copy image URL"}
            </button>
            <button
              onClick={() => copy("credit")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied === "credit" ? <Check size={14} /> : <Copy size={14} />} {copied === "credit" ? "Copied" : "Copy credit line"}
            </button>
            <a
              href={p.unsplashUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink size={14} /> View on Unsplash
            </a>
          </div>

          <p className="mt-auto text-[11px] text-gray-400">
            Credit: “{credit}”. The URL is served by Unsplash at up to 1600px wide — paste it straight into an
            email or blog image field.
          </p>
        </div>
      </div>
    </div>
  );
}
