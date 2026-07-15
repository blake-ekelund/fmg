"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { portalGet, type PortalAsset } from "@/components/portal/api";

type Filter = "all" | "photo" | "product";

export default function PortalAssets() {
  const [assets, setAssets] = useState<PortalAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    portalGet<{ assets: PortalAsset[] }>("/api/portal/assets")
      .then((d) => setAssets(d.assets))
      .catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(
    () => (assets ?? []).filter((a) => filter === "all" || a.kind === filter),
    [assets, filter],
  );

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Brand assets</h1>
        <p className="mt-1 text-sm text-gray-500">Approved imagery you can use in your selling. Links expire after 1 hour.</p>
      </div>

      <div className="flex gap-1.5">
        {(["all", "photo", "product"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {f === "photo" ? "Marketing photos" : f === "product" ? "Product imagery" : "All"}
          </button>
        ))}
      </div>

      {!assets ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
          No assets available yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="relative aspect-square bg-gray-50">
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                {a.url && (
                  <a
                    href={a.url}
                    download={a.fileName ?? true}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
                  >
                    <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow">
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </span>
                  </a>
                )}
              </div>
              <div className="p-3">
                <div className="truncate text-xs font-medium text-gray-900" title={a.title}>
                  {a.title}
                </div>
                {a.description && <div className="mt-0.5 line-clamp-2 text-xs text-gray-400">{a.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
