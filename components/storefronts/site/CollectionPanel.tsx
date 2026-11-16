"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import type { CollectionCopy } from "@/lib/site/pageBlocks";
import type { SiteBrand } from "@/lib/site/registry";
import { authHeader } from "./siteApi";
import { Field, ImageInput, Select, TextArea, TextInput } from "./fields";
import type { CatalogItem } from "./BlockInspector";

/** What /api/site-collections/<brand> takes (notes.0–2 for each note). */
export type CollectionField =
  | "tagline"
  | "description"
  | "notes.0"
  | "notes.1"
  | "notes.2"
  | "image"
  | "heroProduct"
  | HeroField;
/** NI: the living hero slide's words. */
type HeroField = "heroLabel" | "heroTitle" | "heroAccent" | "heroDescription" | "heroInvitation" | "heroKicker" | "heroLine";

const HERO: { field: HeroField; label: string; max: number; rows?: number }[] = [
  { field: "heroLabel", label: "Small label", max: 60 },
  { field: "heroTitle", label: "Headline", max: 60 },
  { field: "heroAccent", label: "Headline, second line", max: 60 },
  { field: "heroDescription", label: "Paragraph", max: 600, rows: 3 },
  { field: "heroInvitation", label: "Invitation", max: 120 },
  { field: "heroKicker", label: "Footer kicker", max: 80 },
  { field: "heroLine", label: "Footer line", max: 120 },
];

/** Save one collection field LIVE (the store's collection words page, draft + published). */
export async function saveCollectionField(brand: SiteBrand, slug: string, field: CollectionField, value: string): Promise<void> {
  const res = await fetch(`/api/site-collections/${brand}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ slug, field, value }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || `Save failed (${res.status})`);
  }
}

/**
 * The collection on the canvas, in the Website editor's side panel: its
 * words and picture. Saved live — the same entry as the store's collection
 * words page (Fragrance collections (words) on NI, Collections (words &
 * pictures) on Sassy), so there's nothing to publish. `version` bumps when
 * words were typed on the page, so the fields here catch up.
 */
export default function CollectionPanel({
  brand,
  slug,
  catalog,
  version,
  onSaved,
  onOpenWordsPage,
}: {
  brand: SiteBrand;
  slug: string;
  /** Products, for NI's featured product. */
  catalog: CatalogItem[];
  version: number;
  /** After a save here: the canvas reloads to show it. */
  onSaved: () => void;
  onOpenWordsPage?: () => void;
}) {
  const [item, setItem] = useState<CollectionCopy | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<CollectionField, ReturnType<typeof setTimeout>>());
  const ni = brand === "NI";

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/site-collections/${brand}`, { headers: await authHeader() });
      const json = (await res.json().catch(() => ({}))) as { items?: CollectionCopy[]; error?: string };
      if (!alive) return;
      const found = json.items?.find((c) => c.slug === slug) ?? null;
      if (!res.ok || !found) setError(json.error || "Couldn't load this collection.");
      setItem(found);
    })();
    return () => {
      alive = false;
    };
  }, [brand, slug, version]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((x) => clearTimeout(x));
  }, []);

  const save = async (field: CollectionField, value: string) => {
    setState("saving");
    try {
      await saveCollectionField(brand, slug, field, value);
      setState("saved");
      setError(null);
      onSaved();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Save failed.");
    }
  };
  /** Typing waits a beat; pickers save at once. */
  const change = (field: CollectionField, value: string, wait = 900) => {
    setItem((c) => {
      if (!c) return c;
      if (field.startsWith("notes.")) {
        const k = Number(field.slice(6));
        return { ...c, notes: [0, 1, 2].map((i) => (i === k ? value : (c.notes[i] ?? ""))) };
      }
      return { ...c, [field]: value };
    });
    const prev = timers.current.get(field);
    if (prev) clearTimeout(prev);
    if (!wait) return void save(field, value);
    timers.current.set(
      field,
      setTimeout(() => {
        timers.current.delete(field);
        void save(field, value);
      }, wait),
    );
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-2">
        <Layers size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">{item?.name || slug}</h2>
          <p className="text-[11px] text-gray-500">The collection&apos;s own words and picture.</p>
        </div>
      </div>
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
        Changes here go live on the store within a minute — there&apos;s nothing to publish. They&apos;re the same words as{" "}
        {onOpenWordsPage ? (
          <button type="button" onClick={onOpenWordsPage} className="font-semibold underline">
            {ni ? "Fragrance collections (words)" : "Collections (words & pictures)"}
          </button>
        ) : (
          "the collection words page"
        )}
        , and every page that shows this collection follows. You can also type straight into the words on the page.
      </p>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">The name and colors stay in the store.</span>
        <span className={state === "error" ? "text-red-600" : "text-gray-500"}>
          {state === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Saving…
            </span>
          ) : state === "saved" ? (
            "Saved — live in a minute"
          ) : state === "error" ? (
            "Not saved"
          ) : null}
        </span>
      </div>
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {item ? (
        <div className="space-y-4">
          <Field label="Tagline" hint={ni ? "Small line on tiles and above the name." : "Shown as “the …” above the name."}>
            <TextInput value={item.tagline} maxLength={80} onChange={(v) => change("tagline", v)} />
          </Field>
          <Field label={ni ? "Scent story" : "Description"}>
            <TextArea value={item.description} rows={4} maxLength={600} onChange={(v) => change("description", v)} />
          </Field>
          {ni ? (
            <Field label="Three notes">
              <div className="space-y-1.5">
                {([0, 1, 2] as const).map((k) => (
                  <TextInput
                    key={k}
                    value={item.notes[k] ?? ""}
                    maxLength={60}
                    onChange={(v) => change(`notes.${k}`, v)}
                  />
                ))}
              </div>
            </Field>
          ) : null}
          <Field
            label="Picture"
            hint={ni ? "On the collection's tiles (collections page, homepage, Keep exploring)." : "Shown when the collection page is shared (link previews)."}
          >
            <ImageInput
              value={item.image ?? ""}
              optional={ni ? "Blank = a photo from its products" : "Blank = the store's built-in picture"}
              onChange={(v) => change("image", v, 0)}
            />
          </Field>
          {ni ? (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-700">Hero slide (top of the collection page + homepage)</p>
              <p className="text-[11px] text-gray-500">Blank fields keep the store&apos;s built-in words.</p>
              {HERO.map((h) => (
                <Field key={h.field} label={h.label}>
                  {h.rows ? (
                    <TextArea value={item[h.field]} rows={h.rows} maxLength={h.max} onChange={(v) => change(h.field, v)} />
                  ) : (
                    <TextInput value={item[h.field]} maxLength={h.max} onChange={(v) => change(h.field, v)} />
                  )}
                </Field>
              ))}
            </div>
          ) : null}
          {ni ? (
            <Field label="Featured product" hint="Whose photos stand for the collection when no picture is set.">
              <Select
                value={item.heroProduct ?? ""}
                onChange={(v) => change("heroProduct", v, 0)}
                options={[
                  { value: "", label: "The store's default" },
                  ...(item.heroProduct && !catalog.some((c) => c.part === item.heroProduct)
                    ? [{ value: item.heroProduct, label: item.heroProduct }]
                    : []),
                  ...catalog.map((c) => ({ value: c.part, label: `${c.name} · ${c.part}` })),
                ]}
              />
            </Field>
          ) : null}
        </div>
      ) : !error ? (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : null}
    </div>
  );
}
