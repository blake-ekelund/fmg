"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Puzzle,
  Unlink,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Loader2,
  Lock,
  Monitor,
  PanelTop,
  RefreshCw,
  RotateCcw,
  Settings2,
  Smartphone,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  BLOCK_INFO,
  LIMITS,
  canBeWidget,
  pageAddable,
  type PageBlock,
  type PageBlockType,
} from "@/lib/site/pageBlocks";
import {
  SITE_BRANDS,
  isSiteBrand,
  newSiteBlock,
  sitePageFor,
  sitePagesFor,
  type SiteBrand,
} from "@/lib/site/registry";
import BlockInspector, { type CatalogItem } from "./BlockInspector";
import { BLOCK_ICON, summary } from "./blockMeta";
import { IconButton, move } from "./fields";
import { useWidgets, type SiteWidget } from "./useWidgets";

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

type PageStatus = { slug: string; publishedAt: string | null; updatedAt: string | null; unpublished: boolean };

/** Messages from the store's edit bridge (src/components/site-edit-bridge.tsx). */
type FromBridge =
  | { src: "site-edit"; type: "ready"; ids: string[] }
  | { src: "site-edit"; type: "scroll"; y: number }
  | { src: "site-edit"; type: "select"; id: string | null }
  | { src: "site-edit"; type: "drop"; blockType: string; widgetId?: string; targetId: string; pos: "before" | "after" };

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(brand: SiteBrand, slug: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/site-pages/${brand}/${slug}`, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/** Every page with its publish state, for the page dropdown (null on failure). */
async function fetchStatuses(brand: SiteBrand): Promise<PageStatus[] | null> {
  try {
    const res = await fetch(`/api/site-pages/${brand}`, { headers: await authHeader() });
    return res.ok ? ((await res.json()) as { pages: PageStatus[] }).pages : null;
  } catch {
    return null;
  }
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function uid(type: string) {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Website builder — each storefront page as a stack of blocks, laid out like
 * the blog builder: block palette + page layers on the left, the REAL store
 * page in the middle, and a right rail with the selected block's settings or
 * the page's publishing settings.
 *
 * The canvas is the store's own /preview page rendering the DRAFT in an
 * iframe, with the store's edit bridge (?edit=1): hovering outlines a block,
 * clicking selects it, and palette tiles dragged onto it drop before/after
 * the block under the pointer. Edits autosave to the draft and the canvas
 * reloads (keeping its scroll); nothing reaches the live site until Publish.
 * Store + page live in the URL (?brand=…&page=…).
 */
export default function SiteEditorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const b = params.get("brand");
  const brand: SiteBrand = isSiteBrand(b) ? b : "Sassy";
  const q = params.get("page");
  const slug = q && sitePageFor(brand, q) ? q : "home";
  const [statuses, setStatuses] = useState<PageStatus[]>([]);
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchStatuses(brand).then((pages) => {
      if (alive) setStatuses(pages ?? []);
    });
    return () => {
      alive = false;
    };
  }, [brand, statusTick]);

  const refreshStatuses = useCallback(() => setStatusTick((t) => t + 1), []);
  const navigate = useCallback(
    (nextBrand: SiteBrand, nextSlug: string) =>
      router.replace(`?brand=${nextBrand}&page=${nextSlug}`, { scroll: false }),
    [router],
  );

  return (
    <PageEditor
      key={`${brand}:${slug}`}
      brand={brand}
      slug={slug}
      statuses={statuses}
      onNavigate={navigate}
      onChanged={refreshStatuses}
    />
  );
}

function PageEditor({
  brand,
  slug,
  statuses,
  onNavigate,
  onChanged,
}: {
  brand: SiteBrand;
  slug: string;
  statuses: PageStatus[];
  onNavigate: (brand: SiteBrand, slug: string) => void;
  onChanged: () => void;
}) {
  const def = sitePageFor(brand, slug)!;
  const host = SITE_BRANDS.find((x) => x.brand === brand)!.host;
  const [page, setPage] = useState<PageState | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"block" | "page">("block");
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewPart, setPreviewPart] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  // "device:frameKey" of the last canvas load that finished.
  const [loadedFrame, setLoadedFrame] = useState("");
  const [layerDrop, setLayerDrop] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  const blocksRef = useRef<PageBlock[]>([]);
  const selectedRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const againRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const layerDragRef = useRef<string | null>(null);
  // Saved widgets for this store; a widget save reloads the canvas.
  const reloadCanvas = useCallback(() => setFrameKey((k) => k + 1), []);
  const w = useWidgets(brand, reloadCanvas);
  const widgetById = useMemo(() => new Map(w.widgets.map((x) => [x.id, x])), [w.widgets]);
  // Canvas scroll, kept here across autosave reloads (the bridge reports it).
  const canvasScrollRef = useRef(0);
  // Frame key the bridge last said "ready" for; a canvas that loads but never
  // connects (e.g. a store without the bridge deployed) gets a notice.
  const [bridgeFrame, setBridgeFrame] = useState<number | null>(null);
  const frameKeyRef = useRef(0);
  useEffect(() => {
    frameKeyRef.current = frameKey;
  }, [frameKey]);

  // ── load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const data = await call<PageState>(brand, slug, "GET");
      setPage(data);
      setBlocks(data.draft);
      blocksRef.current = data.draft;
      setSaveState("saved");
      setFrameKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the page.");
    }
  }, [brand, slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Published products for the product pickers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("storefront_products")
        .select("part, display_name")
        .eq("brand", brand)
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
  }, [brand]);

  // ── autosave ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (savingRef.current) {
      againRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await call<{ updatedAt: string | null; previewUrl: string | null }>(brand, slug, "PUT", {
        blocks: blocksRef.current,
      });
      setPage((p) => (p ? { ...p, updatedAt: res.updatedAt, previewUrl: res.previewUrl ?? p.previewUrl } : p));
      setSaveState("saved");
      setFrameKey((k) => k + 1);
      onChanged();
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
  }, [brand, slug, onChanged]);

  // Switching pages unmounts this editor: save a pending edit right away.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        save();
      }
    },
    [save],
  );

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
    if (name === "discard" && !confirm("Throw away your unpublished changes and go back to what's live?")) return;
    if (
      name === "reset" &&
      !confirm(`Replace the draft with the original ${def.label.toLowerCase()}? (Nothing goes live until you publish.)`)
    )
      return;
    setBusy(name);
    setError(null);
    try {
      await flush();
      await w.flush();
      // First publish of a never-saved page: create the row first.
      if (name === "publish" && !page?.updatedAt) await save();
      const data = await call<PageState>(brand, slug, "POST", { action: name, versionId });
      setPage(data);
      setBlocks(data.draft);
      blocksRef.current = data.draft;
      setSaveState("saved");
      setFrameKey((k) => k + 1);
      onChanged();
      if (name === "publish") void w.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  // ── block operations ───────────────────────────────────────────────────
  const pinnedCount = blocks.filter((x) => BLOCK_INFO[x.type].pinned).length;
  const present = new Set(blocks.map((x) => x.type));
  const allowedHere = pageAddable(def);
  const addable = allowedHere.filter((t) => t !== "widget" && !(BLOCK_INFO[t].single && present.has(t)));
  const widgetTiles = def.fixed
    ? []
    : w.widgets.filter((x) => x.draft && allowedHere.includes(x.draft.type));

  // The announcement bar and footer are marked "__site:<type>" in the canvas
  // (they belong to every page); on the Header & footer page they ARE this
  // page's blocks, so map between the two.
  const toCanvasId = useCallback(
    (id: string | null) => {
      if (!id || slug !== "site") return id;
      const b = blocksRef.current.find((x) => x.id === id);
      return b ? `__site:${b.type}` : id;
    },
    [slug],
  );
  const [siteHint, setSiteHint] = useState<string | null>(null);

  const select = useCallback(
    (id: string | null, scroll = true) => {
      setSelected(id);
      selectedRef.current = id;
      setSiteHint(null);
      if (id) setTab("block");
      frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "select", id: toCanvasId(id), scroll }, "*");
    },
    [toCanvasId],
  );

  /** Insert a new block of `type` next to `targetId` (default: after the
   *  selection, else at the end) — never above the pinned blocks. */
  const insert = useCallback(
    (type: PageBlockType, targetId?: string | null, pos: "before" | "after" = "after", widgetId?: string) => {
      const list = blocksRef.current;
      if (!pageAddable(def).includes(type) || list.length >= LIMITS.blocks) return;
      if (BLOCK_INFO[type].single && list.some((x) => x.type === type)) return;
      if (type === "widget" && !widgetId) return;
      const id = uid(type);
      const block: PageBlock =
        type === "widget" ? { id, type: "widget", widgetId: widgetId! } : newSiteBlock(brand, type, id);
      const pinned = list.filter((x) => BLOCK_INFO[x.type].pinned).length;
      const anchor = targetId ?? selectedRef.current;
      const at = anchor ? list.findIndex((x) => x.id === anchor) : -1;
      let index = at < 0 ? list.length : pos === "before" ? at : at + 1;
      index = Math.max(pinned, Math.min(index, list.length));
      const next = [...list];
      next.splice(index, 0, block);
      update(next);
      select(id, false);
    },
    [brand, def, update, select],
  );

  const current = blocks.find((x) => x.id === selected) ?? null;
  const currentIndex = current ? blocks.indexOf(current) : -1;
  const currentInfo = current ? BLOCK_INFO[current.type] : null;
  const movable = !!current && !def.fixed && !currentInfo?.pinned;
  const removable = !!current && !def.fixed && !currentInfo?.locked;

  // ── canvas bridge ──────────────────────────────────────────────────────
  const labels = useMemo(
    () => ({
      "__site:announcement": "Announcement bar (every page)",
      "__site:footer": "Footer (every page)",
      ...Object.fromEntries(
        blocks.map((x) => [
          toCanvasId(x.id) ?? x.id,
          x.type === "widget" ? `Widget · ${widgetById.get(x.widgetId)?.name ?? "missing"}` : BLOCK_INFO[x.type].label,
        ]),
      ),
    }),
    [blocks, toCanvasId, widgetById],
  );
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
    frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "labels", labels }, "*");
  }, [labels]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromBridge>) => {
      // Only our canvas frame — matched by window, not origin, so a store
      // that redirects (www ↔ apex) still talks to the editor.
      if (!frameRef.current || e.source !== frameRef.current.contentWindow || e.data?.src !== "site-edit") return;
      const m = e.data;
      if (m.type === "scroll") {
        canvasScrollRef.current = m.y;
      } else if (m.type === "ready") {
        setBridgeFrame(frameKeyRef.current);
        const w = frameRef.current?.contentWindow;
        w?.postMessage({ src: "site-edit", type: "labels", labels: labelsRef.current }, "*");
        w?.postMessage({ src: "site-edit", type: "restore", y: canvasScrollRef.current }, "*");
        w?.postMessage({ src: "site-edit", type: "select", id: toCanvasId(selectedRef.current), scroll: false }, "*");
      } else if (m.type === "select") {
        // A click on something this page doesn't own (e.g. the homepage shown
        // as the backdrop of the collection-words page) selects the page's
        // only block, or nothing.
        const list = blocksRef.current;
        let id: string | null;
        let hint: string | null = null;
        if (m.id?.startsWith("__site:")) {
          const type = m.id.slice("__site:".length);
          id = list.find((x) => x.type === type)?.id ?? null;
          if (!id) hint = type;
        } else {
          id = m.id && list.some((x) => x.id === m.id) ? m.id : list.length === 1 ? list[0].id : null;
        }
        setSelected(id);
        selectedRef.current = id;
        setSiteHint(hint);
        if (id || hint) setTab("block");
        if (toCanvasId(id) !== m.id && !hint) {
          frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "select", id: toCanvasId(id), scroll: false }, "*");
        }
      } else if (m.type === "drop") {
        insert(m.blockType as PageBlockType, m.targetId, m.pos, m.widgetId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [insert, toCanvasId]);

  const hoverInCanvas = (id: string | null) =>
    frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "hover", id: toCanvasId(id) }, "*");

  // ── derived ────────────────────────────────────────────────────────────
  const unpublished = useMemo(() => {
    if (!page) return false;
    if (!page.published) return true;
    if (JSON.stringify(page.published) !== JSON.stringify(blocks)) return true;
    // A linked widget with unpublished edits also needs a publish.
    return blocks.some((x) => {
      if (x.type !== "widget") return false;
      const wd = widgetById.get(x.widgetId);
      return !!wd && JSON.stringify(wd.draft) !== JSON.stringify(wd.published);
    });
  }, [page, blocks, widgetById]);

  const partParam = slug === "product" && previewPart ? `&part=${encodeURIComponent(previewPart)}` : "";
  const previewSrc = page?.previewUrl ? `${page.previewUrl}&bare=1&edit=1${partParam}&v=${frameKey}` : null;
  const canvasLoading = !!previewSrc && loadedFrame !== `${device}:${frameKey}`;
  // Loaded, but no word from the bridge — give it a moment before saying so.
  const [bridgeLate, setBridgeLate] = useState(false);
  useEffect(() => {
    setBridgeLate(false);
    if (canvasLoading) return;
    const t = setTimeout(() => setBridgeLate(true), 4000);
    return () => clearTimeout(t);
  }, [canvasLoading, frameKey]);
  const bridgeMissing = bridgeLate && bridgeFrame === null;

  if (!page && !error) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center text-sm text-gray-500">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading {def.label.toLowerCase()}…
      </div>
    );
  }

  const pages = sitePagesFor(brand);
  const groups = [...new Set(pages.map((p) => p.group))];
  const pageTag = (s: string) => {
    const st = statuses.find((x) => x.slug === s);
    return !st?.updatedAt ? "" : st.unpublished ? "  • unpublished changes" : "  • published";
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* ── top bar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <select
          value={brand}
          aria-label="Website"
          onChange={(e) => {
            const next = e.target.value as SiteBrand;
            onNavigate(next, sitePageFor(next, slug) ? slug : "home");
          }}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 outline-none focus:border-indigo-400"
        >
          {SITE_BRANDS.map((x) => (
            <option key={x.brand} value={x.brand}>
              {x.label}
            </option>
          ))}
        </select>
        <select
          value={slug}
          aria-label="Page"
          onChange={(e) => onNavigate(brand, e.target.value)}
          className="min-w-[12rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-indigo-400"
        >
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {pages
                .filter((p) => p.group === g)
                .map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.label}
                    {pageTag(p.slug)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span className="hidden truncate text-xs text-gray-400 lg:inline">
          {host}
          {def.path}
        </span>
        <span className="mx-1 hidden h-4 w-px bg-gray-200 sm:block" />
        <SaveBadge state={saveState} />
        {page?.publishedAt ? (
          <span className={clsx("hidden text-[11px] md:inline", unpublished ? "text-amber-600" : "text-gray-400")}>
            {unpublished ? "Unpublished changes" : `Live since ${when(page.publishedAt)}`}
          </span>
        ) : (
          <span className="hidden text-[11px] text-gray-400 md:inline">Not published yet</span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {slug === "product" ? (
            <select
              value={previewPart}
              onChange={(e) => setPreviewPart(e.target.value)}
              aria-label="Preview with product"
              className="max-w-[14rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none"
            >
              <option value="">Preview: first product</option>
              {catalog.map((c) => (
                <option key={c.part} value={c.part}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {(
              [
                ["desktop", Monitor, "Desktop"],
                ["mobile", Smartphone, "Phone"],
              ] as const
            ).map(([d, Icon, label]) => (
              <button
                key={d}
                type="button"
                title={label}
                onClick={() => setDevice(d)}
                className={clsx("rounded-md px-2 py-1", device === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
          <IconButton label="Reload canvas" onClick={() => setFrameKey((k) => k + 1)}>
            {canvasLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </IconButton>
          {page?.previewUrl ? (
            <a
              href={`${page.previewUrl}${partParam}`}
              target="_blank"
              rel="noreferrer"
              title="Open the draft in a new tab"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ExternalLink size={14} />
            </a>
          ) : null}
          <button
            type="button"
            disabled={!!busy || page?.notReady || !unpublished}
            onClick={() => action("publish")}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
          >
            {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : null}
            {unpublished ? "Publish" : "Published"}
          </button>
        </div>
      </header>

      {page?.notReady || error ? (
        <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error ?? page?.hint}</span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)_340px]">
        {/* ── palette + layers ─────────────────────────────────────────── */}
        <aside className="min-h-0 space-y-5 overflow-y-auto border-b border-gray-100 bg-gray-50/60 p-4 md:border-b-0 md:border-r">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Blocks</h3>
            {addable.length ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {addable.map((t) => {
                  const Icon = BLOCK_ICON[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", `site-block:${t}`);
                      }}
                      onClick={() => insert(t)}
                      title={`${BLOCK_INFO[t].description} Click to add, or drag onto the page.`}
                      className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-2.5 text-center text-[11px] font-medium leading-tight text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                    >
                      <Icon size={15} />
                      {BLOCK_INFO[t].label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5 text-[11px] leading-relaxed text-gray-500">
                {def.fixed
                  ? "This page's layout is fixed — click any part of it to edit its words."
                  : "Every block this page can take is already on it."}
              </p>
            )}
          </div>

          {!def.fixed ? (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Widgets</h3>
              {widgetTiles.length ? (
                <div className="mt-2 space-y-1.5">
                  {widgetTiles.map((x) => {
                    const Icon = BLOCK_ICON[x.draft!.type];
                    return (
                      <button
                        key={x.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("text/plain", `site-block:widget:${x.id}`);
                        }}
                        onClick={() => insert("widget", null, "after", x.id)}
                        title={`${BLOCK_INFO[x.draft!.type].label} — click to add, or drag onto the page.`}
                        className="flex w-full items-center gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-left text-[11px] font-medium text-gray-700 transition hover:border-violet-300 hover:text-gray-900"
                      >
                        <Puzzle size={13} className="shrink-0 text-violet-500" />
                        <span className="min-w-0 flex-1 truncate">{x.name}</span>
                        <Icon size={12} className="shrink-0 text-gray-300" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-gray-200 bg-white p-2.5 text-[11px] leading-relaxed text-gray-400">
                  {w.notReady
                    ? "Widgets turn on once the site_widgets migration is applied."
                    : "Select a block and choose “Save as widget” to reuse it on other pages."}
                </p>
              )}
            </div>
          ) : null}

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">On this page</h3>
            <ul className="mt-2 space-y-1" onDragLeave={() => setLayerDrop(null)}>
              {blocks.map((x, i) => {
                const info = BLOCK_INFO[x.type];
                const Icon = BLOCK_ICON[x.type];
                const draggable = !def.fixed && !info.pinned;
                const drop = layerDrop?.id === x.id ? layerDrop.pos : null;
                return (
                  <li
                    key={x.id}
                    draggable={draggable}
                    onDragStart={(e) => {
                      layerDragRef.current = x.id;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", `site-layer:${x.id}`);
                    }}
                    onDragEnd={() => {
                      layerDragRef.current = null;
                      setLayerDrop(null);
                    }}
                    onDragOver={(e) => {
                      const dragging = layerDragRef.current;
                      if (!dragging || dragging === x.id || i < pinnedCount) return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      setLayerDrop({ id: x.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const dragging = layerDragRef.current;
                      if (!dragging || !layerDrop) return;
                      const list = blocksRef.current;
                      const from = list.findIndex((y) => y.id === dragging);
                      const without = list.filter((y) => y.id !== dragging);
                      let to = without.findIndex((y) => y.id === layerDrop.id) + (layerDrop.pos === "after" ? 1 : 0);
                      to = Math.max(pinnedCount, to);
                      if (from >= 0) {
                        without.splice(to, 0, list[from]);
                        update(without);
                      }
                      layerDragRef.current = null;
                      setLayerDrop(null);
                    }}
                    onMouseEnter={() => hoverInCanvas(x.id)}
                    onMouseLeave={() => hoverInCanvas(null)}
                    onClick={() => select(x.id)}
                    className={clsx(
                      "group relative flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px] transition",
                      selected === x.id
                        ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                        : "border-transparent text-gray-700 hover:border-gray-200 hover:bg-white",
                      x.hidden && "opacity-50",
                    )}
                  >
                    {drop ? (
                      <span
                        className={clsx(
                          "pointer-events-none absolute inset-x-1 h-0.5 rounded bg-indigo-500",
                          drop === "before" ? "-top-[3px]" : "-bottom-[3px]",
                        )}
                      />
                    ) : null}
                    {draggable ? (
                      <GripVertical size={12} className="shrink-0 cursor-grab text-gray-300 group-hover:text-gray-400" />
                    ) : (
                      <Lock size={11} className="shrink-0 text-gray-300" />
                    )}
                    <Icon size={13} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate" title={summary(x)}>
                      {x.type === "widget" ? widgetById.get(x.widgetId)?.name ?? "Missing widget" : info.label}
                    </span>
                    {x.hidden ? <EyeOff size={12} className="shrink-0 text-gray-400" /> : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
              <Lock size={11} /> Locked parts
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Parts with a lock are drawn by the store itself (live product grids, the product details, the quiz…). You
              can edit their words, not move or remove them. Everything is styled by the store, so it always stays
              on-brand.
            </p>
          </div>
        </aside>

        {/* ── canvas ───────────────────────────────────────────────────── */}
        <section className="relative flex min-h-[60vh] min-w-0 justify-center overflow-hidden bg-gray-100 p-4">
          {bridgeMissing ? (
            <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-lg bg-gray-900/90 px-3 py-2 text-[11px] text-white shadow-lg">
              Clicking the page to select isn&apos;t connected — pick parts from “On this page” on the left.
            </div>
          ) : null}
          {previewSrc ? (
            <iframe
              ref={frameRef}
              key={device}
              src={previewSrc}
              title={`${def.label} — draft`}
              onLoad={() => setLoadedFrame(`${device}:${frameKey}`)}
              className={clsx(
                "h-full rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity",
                device === "mobile" ? "w-[390px]" : "w-full",
                canvasLoading && "opacity-70",
              )}
            />
          ) : (
            <div className="m-auto max-w-sm text-center text-sm text-gray-500">
              The canvas needs the store connection (SUPABASE_SERVICE_ROLE_KEY) — your edits still save.
            </div>
          )}
        </section>

        {/* ── right rail ───────────────────────────────────────────────── */}
        <aside className="min-h-0 overflow-y-auto border-t border-gray-100 bg-white md:border-l md:border-t-0">
          <div className="sticky top-0 z-[1] flex gap-1 border-b border-gray-100 bg-white p-2">
            {(
              [
                ["block", "Block", <Settings2 key="b" size={12} />],
                ["page", "Page settings", <PanelTop key="p" size={12} />],
              ] as const
            ).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={clsx(
                  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition",
                  tab === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "page" ? (
              <PageSettings
                label={def.label}
                note={def.note}
                url={`${host}${def.path}`}
                page={page}
                unpublished={unpublished}
                busy={busy}
                onAction={action}
                widgets={w.widgets}
                onRenameWidget={w.rename}
                onDeleteWidget={(id) => {
                  if (confirm("Delete this widget? Only possible when no page uses it.")) void w.remove(id);
                }}
              />
            ) : siteHint ? (
              <div className="space-y-3 py-4">
                <p className="text-sm font-semibold text-gray-900">
                  {siteHint === "footer" ? "The footer" : "The announcement bar"}
                </p>
                <p className="text-xs leading-relaxed text-gray-500">
                  It&apos;s on every page of the site, so it&apos;s edited in one place: Header &amp; footer.
                </p>
                {sitePageFor(brand, "site") ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(brand, "site")}
                    className="flex w-full items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-medium text-indigo-800 transition hover:bg-indigo-100"
                  >
                    Edit Header &amp; footer <span aria-hidden>→</span>
                  </button>
                ) : null}
              </div>
            ) : current && currentInfo ? (
              <>
                <div className="flex items-start gap-2">
                  {(() => {
                    const Icon = BLOCK_ICON[current.type];
                    return <Icon size={15} className="mt-0.5 shrink-0 text-gray-400" />;
                  })()}
                  <div className="min-w-0 flex-1">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      {currentInfo.label}
                      {currentInfo.locked ? <Lock size={11} className="text-gray-300" /> : null}
                    </h2>
                    <p className="text-[11px] text-gray-500">{currentInfo.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-0.5 border-b border-gray-100 pb-3">
                  <IconButton
                    label="Move up"
                    disabled={!movable || currentIndex <= pinnedCount}
                    onClick={() => update(move(blocks, currentIndex, currentIndex - 1))}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={!movable || currentIndex === blocks.length - 1}
                    onClick={() => update(move(blocks, currentIndex, currentIndex + 1))}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton
                    label="Duplicate"
                    disabled={!removable || !!currentInfo.single || blocks.length >= LIMITS.blocks}
                    onClick={() => {
                      const id = uid(current.type);
                      const next = [...blocks];
                      next.splice(currentIndex + 1, 0, { ...structuredClone(current), id });
                      update(next);
                      select(id, false);
                    }}
                  >
                    <Copy size={14} />
                  </IconButton>
                  <IconButton
                    label={current.hidden ? "Show on site" : "Hide from site"}
                    disabled={!removable}
                    onClick={() =>
                      update(blocks.map((x) => (x.id === current.id ? { ...x, hidden: !x.hidden || undefined } : x)))
                    }
                  >
                    {current.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </IconButton>
                  <IconButton
                    label="Save as widget (reuse on other pages)"
                    disabled={!removable || !canBeWidget(current.type) || !!w.notReady}
                    onClick={async () => {
                      const name = prompt("Name this widget (only you see it):", currentInfo.label);
                      if (!name?.trim()) return;
                      const made = await w.create(name.trim(), current);
                      if (!made) return;
                      // This block becomes a link to the new widget.
                      update(blocks.map((x) => (x.id === current.id ? { id: x.id, type: "widget", widgetId: made.id } : x)));
                    }}
                  >
                    <Puzzle size={14} />
                  </IconButton>
                  <span className="flex-1" />
                  <IconButton
                    label="Delete"
                    danger
                    disabled={!removable}
                    onClick={() => {
                      update(blocks.filter((x) => x.id !== current.id));
                      select(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                {current.hidden ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Hidden — not shown on the site. Find it in “On this page” on the left.
                  </p>
                ) : null}
                {w.error ? (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{w.error}</p>
                ) : null}
                <div className="mt-4">
                  {current.type === "widget" ? (
                    <WidgetPanel
                      widget={widgetById.get(current.widgetId) ?? null}
                      catalog={catalog}
                      slug={slug}
                      brand={brand}
                      onChangeDraft={(b) => w.updateDraft(current.widgetId, b)}
                      onRename={(name) => w.rename(current.widgetId, name)}
                      onUnlink={(content) => {
                        // A copy just for this page; the widget stays for the others.
                        update(blocks.map((x) => (x.id === current.id ? { ...content, id: x.id } : x)));
                      }}
                    />
                  ) : (
                  <BlockInspector
                    key={current.id}
                    block={current}
                    catalog={catalog}
                    slug={slug}
                    brand={brand}
                    onOpenPage={(next) => (sitePageFor(brand, next) ? onNavigate(brand, next) : undefined)}
                    onChange={(nb) => update(blocks.map((x) => (x.id === nb.id ? nb : x)))}
                  />
                  )}
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-xs leading-relaxed text-gray-400">
                Click any part of the page to edit it,
                <br />
                or drag a block in from the left.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PageSettings({
  label,
  note,
  url,
  page,
  unpublished,
  busy,
  onAction,
  widgets,
  onRenameWidget,
  onDeleteWidget,
}: {
  label: string;
  note: string;
  url: string;
  page: PageState | null;
  unpublished: boolean;
  busy: string | null;
  onAction: (name: "publish" | "discard" | "reset" | "restore", versionId?: string) => void;
  widgets: SiteWidget[];
  onRenameWidget: (id: string, name: string) => void;
  onDeleteWidget: (id: string) => void;
}) {
  return (
    <div className="space-y-5 text-sm">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{url}</p>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">{note}</p>
      </div>

      <div className="rounded-xl border border-gray-200 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</div>
        <p className="mt-1 text-xs text-gray-700">
          {page?.publishedAt
            ? `${unpublished ? "Live, with unpublished changes" : "Live"} — published ${when(page.publishedAt)}.`
            : "Not published yet — the site shows the original page."}
        </p>
        <p className="mt-1 text-[11px] text-gray-400">
          Edits save as a draft automatically. Publish puts them live; the site picks them up within a minute.
        </p>
        <button
          type="button"
          disabled={!!busy || page?.notReady || !unpublished}
          onClick={() => onAction("publish")}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
        >
          {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : null}
          {unpublished ? "Publish changes" : "Everything is published"}
        </button>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          disabled={!!busy || !page?.published || !unpublished}
          onClick={() => onAction("discard")}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={13} /> Discard unpublished changes
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => onAction("reset")}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <RotateCcw size={13} /> Start over from the original page
        </button>
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <History size={11} /> Published versions
        </div>
        {page?.versions.length ? (
          <ul className="mt-2 space-y-1">
            {page.versions.map((v, i) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
                <span className="text-gray-700">
                  {when(v.published_at)}
                  {i === 0 ? <span className="ml-1.5 text-[11px] text-emerald-600">live</span> : null}
                </span>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => onAction("restore", v.id)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                >
                  Load into draft
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-gray-400">None yet — each publish is kept here.</p>
        )}
      </div>

      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <Puzzle size={11} /> Saved widgets (this store)
        </div>
        {widgets.length ? (
          <ul className="mt-2 space-y-1.5">
            {widgets.map((x) => (
              <li key={x.id} className="rounded-lg border border-gray-200 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <input
                    defaultValue={x.name}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== x.name && onRenameWidget(x.id, e.target.value.trim())}
                    className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-xs font-medium text-gray-800 outline-none hover:border-gray-200 focus:border-indigo-400"
                  />
                  <IconButton label="Delete widget" danger disabled={x.usedOn.length > 0} onClick={() => onDeleteWidget(x.id)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
                <p className="mt-0.5 px-1 text-[10px] text-gray-400">
                  {x.draft ? BLOCK_INFO[x.draft.type].label : "?"} ·{" "}
                  {x.usedOn.length ? `on ${x.usedOn.map((u) => u.label).join(", ")}` : "not used yet"}
                  {x.published ? "" : " · not live yet"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-gray-400">None yet. Select a block and use the puzzle button to save it as one.</p>
        )}
      </div>
    </div>
  );
}

/** A linked widget in the rail: its content is edited in place (and changes
 *  every page using it); unlink makes a page-only copy. */
function WidgetPanel({
  widget,
  catalog,
  slug,
  brand,
  onChangeDraft,
  onRename,
  onUnlink,
}: {
  widget: SiteWidget | null;
  catalog: CatalogItem[];
  slug: string;
  brand: SiteBrand;
  onChangeDraft: (b: PageBlock) => void;
  onRename: (name: string) => void;
  onUnlink: (content: PageBlock) => void;
}) {
  if (!widget || !widget.draft) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        This widget no longer exists (it was deleted). Delete this block, or add another widget.
      </p>
    );
  }
  const others = widget.usedOn.filter((u) => u.slug !== slug);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
          <Puzzle size={11} /> Linked widget · {BLOCK_INFO[widget.draft.type].label}
        </div>
        <input
          key={widget.id}
          defaultValue={widget.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== widget.name && onRename(e.target.value.trim())}
          className="mt-1.5 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900 outline-none focus:border-violet-400"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-violet-900/70">
          {others.length
            ? `Edits here also change it on: ${others.map((u) => u.label).join(", ")}.`
            : "Only this page uses it so far."}{" "}
          Publishing any page that uses it puts the edits live.
        </p>
        <button
          type="button"
          onClick={() => onUnlink({ ...widget.draft!, id: widget.id })}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-900"
        >
          <Unlink size={12} /> Unlink — make a copy just for this page
        </button>
      </div>
      <BlockInspector
        key={widget.id}
        block={widget.draft}
        catalog={catalog}
        slug={slug}
        brand={brand}
        onChange={onChangeDraft}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: "saved" | "dirty" | "saving" | "error" }) {
  if (state === "saving" || state === "dirty")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  if (state === "error") return <span className="text-[11px] text-red-600">Not saved</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
      <Check size={11} /> Draft saved
    </span>
  );
}
