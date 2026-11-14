"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ExternalLink, Monitor, PencilLine, RefreshCw, Smartphone } from "lucide-react";
import { authHeader } from "@/components/storefronts/site/siteApi";

type PreviewInfo =
  | {
      available: true;
      brand: "NI" | "Sassy";
      wholesaleOnly: boolean;
      previewUrl: string;
      storeOrigin: string;
      editorHref: string;
    }
  | { available: false; reason: string; message: string };

const STORE_NAME: Record<"NI" | "Sassy", string> = {
  NI: "Natural Inspirations",
  Sassy: "Sassy & Co",
};

/**
 * The product's page on its storefront, embedded. Product data (copy,
 * photos, price) is live the moment it saves, so this is what shoppers see;
 * the layout around it is the Website editor's draft. Mounted fresh each time
 * the tab opens, so it always reflects the latest autosave.
 */
export default function SitePreviewSection({ part }: { part: string }) {
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/products/site-preview?part=${encodeURIComponent(part)}`, {
          headers: await authHeader(),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(body.error ?? "Couldn't load the preview.");
        else setInfo(body as PreviewInfo);
      } catch {
        if (!cancelled) setError("Couldn't load the preview.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [part]);

  const reload = useCallback(() => {
    setFrameLoading(true);
    setFrameKey((k) => k + 1);
  }, []);

  if (error) {
    return <Notice>{error}</Notice>;
  }
  if (!info) {
    return <Notice muted>Loading the site preview…</Notice>;
  }
  if (!info.available) {
    return <Notice>{info.message}</Notice>;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <div className="min-w-0 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{STORE_NAME[info.brand]}</span>
          <span className="text-gray-400"> · {info.storeOrigin.replace(/^https?:\/\//, "")}</span>
          {info.wholesaleOnly && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              Wholesale only — shoppers don&apos;t see this page
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
            {(
              [
                ["desktop", Monitor, "Desktop"],
                ["mobile", Smartphone, "Mobile"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDevice(value)}
                aria-pressed={device === value}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                  device === value
                    ? "bg-white font-medium text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={reload}
            title="Reload preview"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <RefreshCw size={14} className={clsx(frameLoading && "animate-spin")} />
          </button>

          <a
            href={info.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            <ExternalLink size={13} /> New tab
          </a>

          <Link
            href={info.editorHref}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
          >
            <PencilLine size={13} /> Edit on the page
          </Link>
        </div>
      </div>

      {/* Frame */}
      <div className="bg-gray-100 p-4">
        <div
          className={clsx(
            "relative mx-auto overflow-hidden bg-white shadow-sm transition-[width] duration-300",
            device === "mobile" ? "w-[390px] max-w-full rounded-[1.75rem] border-8 border-gray-900" : "w-full rounded-lg"
          )}
        >
          {frameLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            </div>
          )}
          <iframe
            key={frameKey}
            src={info.previewUrl}
            title="Product page on the storefront"
            onLoad={() => setFrameLoading(false)}
            className={clsx("block w-full", device === "mobile" ? "h-[760px]" : "h-[80vh] min-h-[640px]")}
          />
        </div>
      </div>

      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
        Copy, photos and price here are live as soon as they save. Page layout changes made in the
        Website editor show here before they&apos;re published.
      </p>
    </section>
  );
}

function Notice({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-gray-200 bg-white p-10 text-center text-sm",
        muted ? "text-gray-400" : "text-gray-600"
      )}
    >
      {children}
    </div>
  );
}
