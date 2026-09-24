"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Copy, ExternalLink, Heart, Loader2, MapPin, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { UnsplashPhoto, UnsplashProfile } from "@/lib/unsplash";

/**
 * Marketing → Photography: everything our photographers have published on
 * Unsplash (UNSPLASH_PHOTOGRAPHERS), browsable in one place. Same API as the
 * image picker's Unsplash tab (/api/images/unsplash); copying a photo's URL
 * counts as a use, so it pings Unsplash's download tracker like a pick does.
 */

type Resp = {
  configured?: boolean;
  photographers?: string[];
  photos?: UnsplashPhoto[];
  hasMore?: boolean;
  profiles?: UnsplashProfile[];
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
  const [profiles, setProfiles] = useState<UnsplashProfile[]>([]);
  const [photographers, setPhotographers] = useState<string[]>([]);
  const [photographer, setPhotographer] = useState("");
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
        if (photographer) qs.set("photographer", photographer);
        // Profiles only on the first unfiltered load — they don't change per page.
        if (page === 1 && !photographer && profiles.length === 0) qs.set("profiles", "1");
        const res = await fetch(`/api/images/unsplash?${qs}`, { headers: await authHeader() });
        const json = (await res.json().catch(() => ({}))) as Resp;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Couldn't load photos.");
          return;
        }
        setConfigured(json.configured !== false);
        setPhotographers(json.photographers ?? []);
        if (json.profiles) setProfiles(json.profiles);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profiles is a load-once cache
  }, [page, photographer]);

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
          Everything our photographers have published on Unsplash — the same photos the email and blog
          image pickers offer under “Unsplash”. Copy a photo&apos;s URL to use it anywhere; always credit
          the photographer where it appears.
        </p>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Camera size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-600">Unsplash isn&apos;t connected yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
            Set UNSPLASH_ACCESS_KEY and UNSPLASH_PHOTOGRAPHERS (comma-separated usernames) in the server environment.
          </p>
        </div>
      ) : (
        <>
          {/* Photographers */}
          {profiles.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <div key={p.username} className="flex gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                  {p.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Camera size={20} className="text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-gray-900">{p.name}</p>
                      <a href={p.profileUrl} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-700" title="Unsplash profile">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <p className="text-xs text-gray-500">@{p.username}</p>
                    {p.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                        <MapPin size={10} /> {p.location}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-900">{fmt(p.totalPhotos)}</span> photos
                      {p.totalDownloads != null && (
                        <>
                          {" · "}
                          <span className="font-medium text-gray-900">{fmt(p.totalDownloads)}</span> downloads
                        </>
                      )}
                    </p>
                    {p.bio && <p className="mt-1.5 line-clamp-2 text-xs text-gray-500">{p.bio}</p>}
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
            {photographers.length > 1 &&
              ["", ...photographers].map((u) => (
                <button
                  key={u || "all"}
                  onClick={() => {
                    setPhotographer(u);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    photographer === u ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {u ? `@${u}` : "All photographers"}
                </button>
              ))}
            <span className="ml-auto text-xs text-gray-400">
              {q ? `${filtered.length} of ${photos.length} loaded` : `${photos.length} loaded`}
            </span>
          </div>

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
