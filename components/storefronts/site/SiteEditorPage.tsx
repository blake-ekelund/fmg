"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Loader2,
  Lock,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  BLOCK_INFO,
  LIMITS,
  newPageBlock,
  type PageBlock,
  type PageBlockType,
} from "@/lib/site/pageBlocks";
import BlockInspector, { type CatalogItem } from "./BlockInspector";
import { IconButton, move } from "./fields";

type PageState = {
  draft: PageBlock[];
  published: PageBlock[] | null;
  publishedAt: string | null;
  updatedAt: string | null;
  versions: { id: string; published_at: string }[];
  previewUrl: string | null;
  notReady?: boolean;
  hint?: string;
};

const BRAND = "Sassy";
const SLUG = "home";
const API = `/api/site-pages/${BRAND}/${SLUG}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch(API, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One-line summary under each block in the list. */
function summary(b: PageBlock): string {
  switch (b.type) {
    case "hero":
      return `${b.slides.length} slide${b.slides.length === 1 ? "" : "s"} · ${b.slides.map((s) => s.name).join(", ")}`;
    case "value_strip":
      return b.items.join(" · ") || "Empty";
    case "product_row":
      return `${b.heading || "No heading"} · ${b.source === "bestsellers" ? `top ${b.count} sellers` : `${b.parts.length} picked`}`;
    case "shop_by_form":
      return `${b.heading || "No heading"} · ${b.tiles.map((t) => t.label).join(", ")}`;
    case "promo_banner":
      return b.text || "Empty";
    case "image_text":
      return b.heading || "No heading";
    case "newsletter":
      return b.heading.replace(/\n/g, " ");
  }
}

/**
 * Website editor — the storefront homepage as a stack of blocks.
 *
 * Left: the block list (reorder, hide, add, delete) or, with a block
 * selected, its form. Right: the store's own /preview page rendering the
 * DRAFT, reloaded after each autosave. Edits autosave to the draft; nothing
 * reaches the live site until Publish. v1 covers the Sassy homepage only.
 */
export default function SiteEditorPage() {
  const [page, setPage] = useState<PageState | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [frameKey, setFrameKey] = useState(0);
  // "device:frameKey" of the last preview that finished loading.
  const [loadedFrame, setLoadedFrame] = useState("");
  const [menu, setMenu] = useState<"add" | "more" | null>(null);

  // Latest blocks for the debounced save (set wherever blocks change).
  const blocksRef = useRef<PageBlock[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const againRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await call<PageState>("GET");
      setPage(data);
      setBlocks(data.draft);
      blocksRef.current = data.draft;
      setSaveState("saved");
      setFrameKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the page.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Published Sassy products for the product pickers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("storefront_products")
        .select("part, display_name")
        .eq("brand", BRAND)
        .order("display_name")
        .limit(2000);
      if (cancelled || !data) return;
      setCatalog(
        (data as { part: string; display_name: string | null }[]).map((r) => ({
          part: r.part,
          name: r.display_name || r.part,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── autosave ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (savingRef.current) {
      againRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await call<{ updatedAt: string | null; previewUrl: string | null }>("PUT", {
        blocks: blocksRef.current,
      });
      setPage((p) => (p ? { ...p, updatedAt: res.updatedAt, previewUrl: res.previewUrl ?? p.previewUrl } : p));
      setSaveState("saved");
      setFrameKey((k) => k + 1);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      savingRef.current = false;
      if (againRef.current) {
        againRef.current = false;
        save();
      }
    }
  }, []);

  const update = useCallback(
    (next: PageBlock[]) => {
      setBlocks(next);
      blocksRef.current = next;
      setSaveState("dirty");
      setError(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 1200);
    },
    [save],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  async function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (saveState === "dirty" || saveState === "error") await save();
  }

  async function action(name: "publish" | "discard" | "reset" | "restore", versionId?: string) {
    setMenu(null);
    if (name === "discard" && !confirm("Throw away your unpublished changes and go back to what's live?")) return;
    if (name === "reset" && !confirm("Replace the draft with the original homepage? (Nothing goes live until you publish.)")) return;
    setBusy(name);
    setError(null);
    try {
      await flush();
      // First publish of a never-saved page: create the row first.
      if (name === "publish" && !page?.updatedAt) await save();
      const data = await call<PageState>("POST", { action: name, versionId });
      setPage(data);
      setBlocks(data.draft);
      blocksRef.current = data.draft;
      setSaveState("saved");
      setFrameKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  // ── derived ────────────────────────────────────────────────────────────
  const unpublished = useMemo(() => {
    if (!page) return false;
    if (!page.published) return true;
    return JSON.stringify(page.published) !== JSON.stringify(blocks);
  }, [page, blocks]);

  const current = blocks.find((b) => b.id === selected) ?? null;
  const present = new Set(blocks.map((b) => b.type));
  const addable = (Object.keys(BLOCK_INFO) as PageBlockType[]).filter(
    (t) => !BLOCK_INFO[t].locked && !(BLOCK_INFO[t].single && present.has(t)),
  );

  const previewSrc = page?.previewUrl
    ? `${page.previewUrl}&bare=1&v=${frameKey}`
    : null;

  if (!page && !error) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center text-sm text-gray-500">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading the homepage…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col md:flex-row">
      {/* ── left rail ─────────────────────────────────────────────────── */}
      <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-white md:w-[400px] md:border-b-0 md:border-r">
        {/* page header */}
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                sassyandco.com
              </div>
              <h1 className="truncate text-base font-semibold text-gray-900">Homepage</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu(menu === "more" ? null : "more")}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <History size={14} /> <ChevronDown size={12} />
                </button>
                {menu === "more" ? (
                  <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg">
                    <MenuItem
                      disabled={!page?.published || !unpublished}
                      onClick={() => action("discard")}
                    >
                      Discard unpublished changes
                    </MenuItem>
                    <MenuItem onClick={() => action("reset")}>Start over from the original page</MenuItem>
                    {page?.versions.length ? (
                      <>
                        <div className="mt-1 border-t border-gray-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Published versions — load into draft
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {page.versions.map((v, i) => (
                            <MenuItem key={v.id} onClick={() => action("restore", v.id)}>
                              {when(v.published_at)}
                              {i === 0 ? <span className="ml-1.5 text-[11px] text-emerald-600">live</span> : null}
                            </MenuItem>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!!busy || page?.notReady || !unpublished}
                onClick={() => action("publish")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
              >
                {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : null}
                {unpublished ? "Publish" : "Published"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <SaveBadge state={saveState} />
            <span className="text-gray-300">·</span>
            {page?.publishedAt ? (
              <span className={unpublished ? "text-amber-600" : "text-gray-500"}>
                {unpublished ? "Unpublished changes · " : ""}live since {when(page.publishedAt)}
              </span>
            ) : (
              <span className="text-gray-500">Not published yet — the site shows the original page</span>
            )}
          </div>
        </div>

        {page?.notReady || error ? (
          <div className="mx-4 mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error ?? page?.hint}</span>
          </div>
        ) : null}

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current ? (
            <div className="p-5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
              >
                <ArrowLeft size={13} /> All blocks
              </button>
              <h2 className="text-sm font-semibold text-gray-900">{BLOCK_INFO[current.type].label}</h2>
              <p className="mb-4 text-xs text-gray-500">{BLOCK_INFO[current.type].description}</p>
              <BlockInspector
                key={current.id}
                block={current}
                catalog={catalog}
                onChange={(b) => update(blocks.map((x) => (x.id === b.id ? b : x)))}
              />
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {blocks.map((b, i) => {
                const info = BLOCK_INFO[b.type];
                return (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(b.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(b.id)}
                    className={`group flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition hover:border-indigo-300 hover:shadow-sm ${
                      b.hidden ? "border-dashed border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${b.hidden ? "text-gray-400" : "text-gray-900"}`}>
                        {info.label}
                        {info.locked ? <Lock size={11} className="text-gray-300" /> : null}
                        {b.hidden ? <span className="text-[10px] font-normal uppercase tracking-wider">hidden</span> : null}
                      </div>
                      <div className="truncate text-[11px] text-gray-500">{summary(b)}</div>
                    </div>
                    {info.locked ? null : (
                      <div className="flex items-center opacity-60 transition group-hover:opacity-100">
                        <IconButton
                          label="Move up"
                          disabled={i <= 1}
                          onClick={() => update(move(blocks, i, i - 1))}
                        >
                          <ArrowUp size={13} />
                        </IconButton>
                        <IconButton
                          label="Move down"
                          disabled={i === blocks.length - 1}
                          onClick={() => update(move(blocks, i, i + 1))}
                        >
                          <ArrowDown size={13} />
                        </IconButton>
                        <IconButton
                          label={b.hidden ? "Show on site" : "Hide from site"}
                          onClick={() =>
                            update(blocks.map((x) => (x.id === b.id ? { ...x, hidden: !x.hidden || undefined } : x)))
                          }
                        >
                          {b.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </IconButton>
                        <IconButton
                          label="Delete"
                          danger
                          onClick={() => {
                            if (confirm(`Delete the “${info.label}” block?`)) update(blocks.filter((x) => x.id !== b.id));
                          }}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    )}
                  </div>
                );
              })}

              {blocks.length < LIMITS.blocks ? (
                <div className="relative pt-1">
                  <button
                    type="button"
                    onClick={() => setMenu(menu === "add" ? null : "add")}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-600 transition hover:border-indigo-400 hover:text-indigo-700"
                  >
                    <Plus size={14} /> Add block
                  </button>
                  {menu === "add" ? (
                    <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      {addable.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => {
                            const id = `${t}-${Math.random().toString(36).slice(2, 8)}`;
                            update([...blocks, newPageBlock(t, id)]);
                            setSelected(id);
                            setMenu(null);
                          }}
                          className="block w-full px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <div className="text-sm font-medium text-gray-900">{BLOCK_INFO[t].label}</div>
                          <div className="text-[11px] text-gray-500">{BLOCK_INFO[t].description}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="px-1 pt-3 text-[11px] leading-relaxed text-gray-400">
                Changes save as a draft automatically and show in the preview. Customers see them only after you
                Publish — the live site picks them up within a minute. Wholesale buyers see the wholesale homepage,
                which isn&apos;t edited here.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* ── preview ───────────────────────────────────────────────────── */}
      <section className="flex min-h-[60vh] min-w-0 flex-1 flex-col bg-gray-100">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(
              [
                ["desktop", Monitor],
                ["mobile", Smartphone],
              ] as const
            ).map(([d, Icon]) => (
              <button
                key={d}
                type="button"
                title={d === "desktop" ? "Desktop" : "Phone"}
                onClick={() => setDevice(d)}
                className={`rounded-md px-2.5 py-1 ${device === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">Draft preview</span>
          {loadedFrame !== `${device}:${frameKey}` && previewSrc ? <Loader2 size={13} className="animate-spin text-gray-400" /> : null}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="Reload preview" onClick={() => setFrameKey((k) => k + 1)}>
              <RefreshCw size={14} />
            </IconButton>
            {page?.previewUrl ? (
              <a
                href={page.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                <ExternalLink size={13} /> Open
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
          {previewSrc ? (
            <iframe
              key={device}
              src={previewSrc}
              title="Homepage draft preview"
              onLoad={() => setLoadedFrame(`${device}:${frameKey}`)}
              className={`h-full rounded-xl border border-gray-200 bg-white shadow-sm ${
                device === "mobile" ? "w-[390px]" : "w-full"
              }`}
            />
          ) : (
            <div className="m-auto max-w-sm text-center text-sm text-gray-500">
              The preview needs the store connection (SUPABASE_SERVICE_ROLE_KEY) — your edits still save.
            </div>
          )}
        </div>
      </section>

      {menu ? <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} /> : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function SaveBadge({ state }: { state: "saved" | "dirty" | "saving" | "error" }) {
  if (state === "saving" || state === "dirty")
    return (
      <span className="inline-flex items-center gap-1 text-gray-500">
        <Loader2 size={11} className="animate-spin" /> Saving draft…
      </span>
    );
  if (state === "error") return <span className="text-red-600">Not saved</span>;
  return (
    <span className="inline-flex items-center gap-1 text-gray-500">
      <Check size={11} /> Draft saved
    </span>
  );
}
