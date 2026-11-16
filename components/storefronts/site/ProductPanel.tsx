"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Package } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import RichTextField from "@/components/products/RichTextField";
import ProductPhotos, { type ProductPhoto } from "@/components/products/ProductPhotos";
import type { SiteBrand } from "@/lib/site/registry";
import { authHeader } from "./siteApi";

/** The copy fields the storefronts show (keys of /api/products/copy). */
export type ProductCopyField = "shortDescription" | "longDescription" | "benefits" | "ingredients" | "howToUse";

const FIELDS: { field: ProductCopyField; label: string; rows: number; hint?: Partial<Record<SiteBrand, string>> }[] = [
  {
    field: "shortDescription",
    label: "Short description",
    rows: 3,
    hint: { Sassy: "Not shown on the Sassy page — used for search results and link previews." },
  },
  { field: "longDescription", label: "Description", rows: 5 },
  { field: "benefits", label: "Benefits", rows: 4 },
  { field: "ingredients", label: "Ingredients", rows: 4 },
  { field: "howToUse", label: "How to use", rows: 3, hint: { NI: "Not shown on the NI page." } },
];

/** Save one copy field to the catalog (media_kit_products) — live at once. */
export async function saveProductCopy(part: string, field: ProductCopyField, value: string): Promise<void> {
  const res = await fetch("/api/products/copy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ part, field, value }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `Save failed (${res.status})`);
  }
}

type AssetRow = { id: string; asset_type: string; storage_path: string; sort_order?: number | null };

/** The product's photos (media_kit_assets) with signed URLs, as Products loads them. */
async function fetchPhotos(part: string): Promise<ProductPhoto[]> {
  const { data } = await supabase
    .from("media_kit_assets")
    .select("id, asset_type, storage_path, sort_order")
    .eq("part", part);
  const rows = (data as AssetRow[] | null) ?? [];
  const urls: Record<string, string> = {};
  if (rows.length) {
    const { data: signed } = await supabase.storage
      .from("media-kit")
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }
  return rows.map((r) => ({
    id: r.id,
    tag: r.asset_type,
    path: r.storage_path,
    url: urls[r.storage_path] ?? null,
    sortOrder: r.sort_order ?? null,
  }));
}

/**
 * The product on the canvas, in the Website editor's side panel: its copy
 * and its photos — the SAME records as Products → the product, so every
 * change here is a catalog change and goes live within about a minute (no
 * draft, no Publish). `version` bumps when copy was typed on the page, so
 * the fields here catch up.
 */
export default function ProductPanel({
  part,
  brand,
  version,
  onSaved,
}: {
  part: string;
  brand: SiteBrand;
  version: number;
  /** After a save here: the canvas reloads to show it. */
  onSaved: () => void;
}) {
  const [name, setName] = useState(part);
  const [copy, setCopy] = useState<Record<ProductCopyField, string> | null>(null);
  const [photos, setPhotos] = useState<ProductPhoto[] | null>(null);
  // Bumps when the copy (re)loads, so the editors take the fresh text.
  const [loaded, setLoaded] = useState(0);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<ProductCopyField, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/products/copy?part=${encodeURIComponent(part)}`, { headers: await authHeader() });
      const json = (await res.json().catch(() => ({}))) as {
        name?: string;
        copy?: Record<ProductCopyField, string>;
        error?: string;
      };
      if (!alive) return;
      if (!res.ok || !json.copy) {
        setError(json.error || "Couldn't load this product.");
        return;
      }
      setName(json.name || part);
      setCopy(json.copy);
      setLoaded((n) => n + 1);
    })();
    return () => {
      alive = false;
    };
  }, [part, version]);

  const [photoTick, setPhotoTick] = useState(0);
  const loadPhotos = useCallback(() => setPhotoTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    fetchPhotos(part).then((p) => {
      if (alive) setPhotos(p);
    });
    return () => {
      alive = false;
    };
  }, [part, photoTick]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => clearTimeout(x));
  }, []);

  const change = (field: ProductCopyField, value: string) => {
    setCopy((c) => (c ? { ...c, [field]: value } : c));
    const prev = timers.current.get(field);
    if (prev) clearTimeout(prev);
    timers.current.set(
      field,
      setTimeout(async () => {
        timers.current.delete(field);
        setState("saving");
        try {
          await saveProductCopy(part, field, value);
          setState("saved");
          setError(null);
          onSaved();
        } catch (e) {
          setState("error");
          setError(e instanceof Error ? e.message : "Save failed.");
        }
      }, 900),
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2">
        <Package size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{name}</h2>
          <p className="text-[11px] text-gray-500">The product&apos;s own words and photos.</p>
        </div>
      </div>
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
        Changes here save straight to the catalog — the same text and photos as{" "}
        <a href={`/products/${encodeURIComponent(part)}`} target="_blank" rel="noreferrer" className="font-semibold underline">
          Products → {name}
        </a>
        . They go live on the store within a minute; there&apos;s nothing to publish. You can also type straight into
        the text on the page.
      </p>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">Name, price, sizes and colors stay in Products.</span>
        <span className={state === "error" ? "text-red-600" : "text-gray-500"}>
          {state === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Saving…
            </span>
          ) : state === "saved" ? (
            "Saved to the catalog"
          ) : state === "error" ? (
            "Not saved"
          ) : null}
        </span>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {copy ? (
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <RichTextField
              key={`${f.field}:${loaded}`}
              label={f.label}
              rows={f.rows}
              value={copy[f.field]}
              hint={f.hint?.[brand]}
              onChange={(v) => change(f.field, v)}
            />
          ))}
        </div>
      ) : !error ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : null}

      <div className="border-t border-gray-100 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Photos</h3>
          <a
            href={`/products/${encodeURIComponent(part)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800"
          >
            Open in Products <ExternalLink size={11} />
          </a>
        </div>
        {photos ? (
          <ProductPhotos
            part={part}
            productName={name}
            photos={photos}
            onChanged={() => {
              void loadPhotos();
              onSaved();
            }}
          />
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={13} className="animate-spin" /> Loading photos…
          </div>
        )}
      </div>
    </div>
  );
}
