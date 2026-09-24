"use client";

import { useEffect, useState } from "react";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { UnsplashPhoto } from "@/lib/unsplash";

/** What the picker hands back alongside the URL for an Unsplash photo. */
export type UnsplashPick = {
  alt: string | null;
  /** "Photo by <name> on Unsplash" — the attribution Unsplash asks for. */
  credit: { name: string; profileUrl: string; unsplashUrl: string };
};

type Source = { key: string; label: string };
type Resp = {
  configured?: boolean;
  sources?: Source[];
  errors?: { key: string; label: string; message: string }[];
  photos?: UnsplashPhoto[];
  hasMore?: boolean;
  error?: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * The Unsplash tab of MediaLibraryModal: our brand collections + photographers,
 * filterable by source and by the photo's own description. Choosing one pings
 * Unsplash's download tracker (guideline-required) and returns a hotlink URL.
 */
export default function UnsplashPanel({ query, onSelect }: { query: string; onSelect: (url: string, pick: UnsplashPick) => void }) {
  const [source, setSource] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(page) });
        if (source) qs.set("source", source);
        const res = await fetch(`/api/images/unsplash?${qs}`, { headers: await authHeader() });
        const json = (await res.json().catch(() => ({}))) as Resp;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Couldn't load Unsplash photos.");
          return;
        }
        setConfigured(json.configured !== false);
        setSources(json.sources ?? []);
        setSourceErrors((json.errors ?? []).map((e) => `${e.label}: ${e.message}`));
        setPhotos((prev) => (page === 1 ? (json.photos ?? []) : [...prev, ...(json.photos ?? [])]));
        setHasMore(Boolean(json.hasMore));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load Unsplash photos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, source]);

  async function choose(p: UnsplashPhoto) {
    // Fire-and-forget: a tracking hiccup shouldn't block using the photo.
    void authHeader().then((headers) =>
      fetch("/api/images/unsplash", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ downloadLocation: p.downloadLocation }),
      }).catch(() => {}),
    );
    onSelect(p.url, {
      alt: p.alt,
      credit: { name: p.photographer.name, profileUrl: p.photographer.profileUrl, unsplashUrl: p.unsplashUrl },
    });
  }

  if (!configured) {
    return (
      <div className="py-16 text-center">
        <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
        <p className="text-sm font-medium text-gray-600">Unsplash isn&apos;t connected yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
          Set UNSPLASH_ACCESS_KEY in the server environment.
        </p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? photos.filter((p) => `${p.alt ?? ""} ${p.photographer.name} ${p.photographer.username}`.toLowerCase().includes(q))
    : photos;

  return (
    <div>
      {sources.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ key: "", label: "All" }, ...sources].map((s) => (
            <button
              key={s.key || "all"}
              onClick={() => {
                setSource(s.key);
                setPage(1);
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                source === s.key
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {sourceErrors.map((m) => (
        <div key={m} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{m}</div>
      ))}
      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      {loading && photos.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading Unsplash…
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className="py-16 text-center">
          <ImageIcon size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-600">{photos.length === 0 ? "No photos yet" : "No matches"}</p>
          <p className="mt-1 text-xs text-gray-400">
            {photos.length === 0 ? "Nothing published in these sources yet." : "Search covers the photos loaded so far — try loading more."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p)}
              title={p.alt ?? undefined}
              className="group overflow-hidden rounded-xl border border-gray-200 text-left transition hover:border-violet-400 hover:ring-2 hover:ring-violet-200"
            >
              <div className="aspect-square" style={{ backgroundColor: p.color ?? "#f9fafb" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.alt ?? ""} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="truncate border-t border-gray-100 px-2 py-1 text-[10px] text-gray-500">
                Photo by {p.photographer.name}
              </div>
            </button>
          ))}
        </div>
      )}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setPage((n) => n + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />} Load more
          </button>
        </div>
      )}
      <p className="mt-4 text-center text-[10px] text-gray-400">
        Photos from{" "}
        <a href="https://unsplash.com/?utm_source=fmg_portal&utm_medium=referral" target="_blank" rel="noreferrer" className="underline">
          Unsplash
        </a>{" "}
        — credit the photographer where the image appears.
      </p>
    </div>
  );
}
