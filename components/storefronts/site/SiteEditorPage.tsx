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
  Redo2,
  Plus,
  ChevronLeft,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/BrandContext";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { call, fetchStatuses, when, type PageStatus } from "./siteApi";
import {
  BLOCK_INFO,
  LIMITS,
  canBeWidget,
  pageAddable,
  themePalette,
  type BlockColors,
  type PageBlock,
  type PageBlockType,
} from "@/lib/site/pageBlocks";
import {
  SITE_BRANDS,
  isSiteBrand,
  newSiteBlock,
  normalizeSitePage,
  sitePageFor,
  sitePagesFor,
  type SiteBrand,
} from "@/lib/site/registry";
import BlockInspector, { type CatalogItem } from "./BlockInspector";
import { BlockColorsPanel } from "./ColorsPanel";
import { CanvasToolbar, type EditingKind, type FormatCmd } from "./CanvasToolbar";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import { uploadBlogImageResult } from "@/components/marketing/blog/api";
import { setBlockPath } from "@/lib/site/editPath";
import { BLOCK_ICON, summary } from "./blockMeta";
import { IconButton, move } from "./fields";
import { useWidgets, type SiteWidget } from "./useWidgets";
import SectionPicker from "./SectionPicker";
import PublishReview, { diffPage } from "./PublishReview";
import SiteHome from "./SiteHome";

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

/** Where the canvas toolbar sits: just above the selected block, pinned to
 *  the top of the canvas while the block's top is scrolled away; hidden once
 *  the block is off screen. */
function toolbarPos(b: {
  top: number;
  left: number;
  width: number;
  height: number;
  frameTop: number;
  frameBottom: number;
  frameLeft: number;
  frameWidth: number;
}): { top: number; left: number; maxWidth: number } | null {
  if (b.top + b.height < b.frameTop + 48 || b.top > b.frameBottom - 40) return null;
  const left = Math.max(b.left, b.frameLeft) + 6;
  return {
    top: Math.max(b.top - 40, b.frameTop + 6),
    left,
    maxWidth: b.frameLeft + b.frameWidth - left - 6,
  };
}

/** Blocks the store draws in client components (state of their own), so
 *  text typed into them on the canvas is re-rendered from the save. */
const CLIENT_DRAWN = new Set<PageBlockType>(["hero"]);

/** Blocks that are whole pages or data, not a section to recolor. */
const NO_COLORS = new Set<PageBlockType>(["theme", "quiz", "collections_copy"]);


/** Messages from the store's edit bridge (src/components/site-edit-bridge.tsx). */
type FromBridge =
  | { src: "site-edit"; type: "ready"; ids: string[] }
  | { src: "site-edit"; type: "scroll"; y: number }
  | { src: "site-edit"; type: "select"; id: string | null }
  | { src: "site-edit"; type: "edit"; id: string; path: string; value: string }
  | { src: "site-edit"; type: "editing"; id: string | null; path: string | null; kind: EditingKind | null }
  | { src: "site-edit"; type: "rect"; id: string | null; rect: { top: number; left: number; width: number; height: number } | null }
  | { src: "site-edit"; type: "image"; id: string; path: string }
  | { src: "site-edit"; type: "drop"; blockType: string; widgetId?: string; targetId: string; pos: "before" | "after" };

function uid(type: string) {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Website — with no ?page= it's the Website home (every page as a card, see
 * SiteHome); with one, the editor: the page's sections on the left, the REAL
 * store page in the middle, and a right rail with the selected section's
 * settings or the page's publishing settings.
 *
 * The canvas is the store's own /preview page rendering the DRAFT in an
 * iframe, with the store's edit bridge (?edit=1): hovering outlines a block,
 * clicking selects it; "+ Add section" (on the page and in the list) opens
 * the SectionPicker. Edits autosave to the draft and the canvas reloads —
 * in a second frame behind the visible one, swapped in once it's scrolled
 * into place, so it never flashes; nothing reaches the live site until Publish.
 * Store + page live in the URL (?brand=…&page=…).
 */
export default function SiteEditorPage() {
  const router = useRouter();
  const params = useSearchParams();
  // The top-right Sassy / NI / All switch picks the store. "All" can't edit
  // two stores at once, so it falls back to the URL / the store picker here.
  const { brand: filter, setBrand: setFilter } = useBrand();
  const b = params.get("brand");
  const brand: SiteBrand = isSiteBrand(b) ? b : filter !== "all" ? filter : "Sassy";
  const q = params.get("page");
  const slug = q && sitePageFor(brand, q) ? q : "home";
  const onHome = !q;
  const [statuses, setStatuses] = useState<PageStatus[]>([]);
  const [statusTick, setStatusTick] = useState(0);

  // A deep link to the other store (?brand=NI while the switch says Sassy)
  // moves the switch along with it — once, on arrival.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (isSiteBrand(b) && filter !== "all" && filter !== b) setFilter(b);
  }, [b, filter, setFilter]);

  // Flipping the switch afterwards opens the same page on that store.
  const lastFilter = useRef(filter);
  useEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    if (!onHome && filter !== "all" && filter !== brand) {
      router.replace(`?brand=${filter}&page=${sitePageFor(filter, slug) ? slug : "home"}`, { scroll: false });
    }
  }, [filter, brand, slug, router, onHome]);

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
  // Home ↔ a page are real steps, so the browser Back button works.
  const open = useCallback(
    (nextBrand: SiteBrand, nextSlug: string) => router.push(`?brand=${nextBrand}&page=${nextSlug}`),
    [router],
  );
  const goHome = useCallback(() => router.push("?"), [router]);

  if (onHome) {
    return <SiteHome brands={filter === "all" ? SITE_BRANDS.map((x) => x.brand) : [filter]} onOpen={open} />;
  }

  return (
    <PageEditor
      key={`${brand}:${slug}`}
      brand={brand}
      slug={slug}
      statuses={statuses}
      onNavigate={navigate}
      onHome={goHome}
      onChanged={refreshStatuses}
    />
  );
}

function PageEditor({
  brand,
  slug,
  statuses,
  onNavigate,
  onHome,
  onChanged,
}: {
  brand: SiteBrand;
  slug: string;
  statuses: PageStatus[];
  onNavigate: (brand: SiteBrand, slug: string) => void;
  onHome: () => void;
  onChanged: () => void;
}) {
  const { brand: filter } = useBrand();
  const def = sitePageFor(brand, slug)!;
  const host = SITE_BRANDS.find((x) => x.brand === brand)!.host;
  const [page, setPage] = useState<PageState | null>(null);
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"block" | "page">("block");
  // The side panel: closed by default (editing happens on the page); pages
  // that are one big form (quiz, colors, collection words) start with it open.
  const [panelOpen, setPanelOpen] = useState(slug === "quiz" || slug === "theme" || slug === "collection-copy");
  // The selected block's box on the canvas (section coordinates) and what's
  // being typed on the page, both from the store's bridge.
  const [selBox, setSelBox] = useState<{ top: number; left: number; width: number; height: number; frameTop: number; frameBottom: number; frameLeft: number; frameWidth: number } | null>(null);
  const [editing, setEditing] = useState<EditingKind | null>(null);
  const [imagePick, setImagePick] = useState<{ id: string; path: string } | null>(null);
  // The "click any text…" hint shows for the first few seconds only.
  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 7000);
    return () => clearTimeout(t);
  }, []);
  const sectionRef = useRef<HTMLElement | null>(null);
  // Whether the next save should reload the canvas: not when the edit was
  // typed on the canvas itself (or recolored live) — it already shows it.
  const reloadRef = useRef(false);
  // Typed into a block the store draws on the client (the hero slideshow):
  // reload the canvas once the typing stops, so it re-renders from the save.
  const reloadOnStopRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewPart, setPreviewPart] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  // "device|src" of the frame on screen. A new draft loads in a second frame
  // behind it and is swapped in once it's ready (see the canvas).
  const [shownKey, setShownKey] = useState<string | null>(null);
  const framesRef = useRef(new Map<string, HTMLIFrameElement>());
  const visibleKeyRef = useRef<string | null>(null);
  const incomingKeyRef = useRef<string | null>(null);
  // The incoming frame's last selection box, applied when it swaps in.
  const incomingRectRef = useRef<Extract<FromBridge, { type: "rect" }> | null>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [layerDrop, setLayerDrop] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  const blocksRef = useRef<PageBlock[]>([]);
  const selectedRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const againRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /** The selected block's box (from the bridge's "rect", in frame
   *  coordinates) → the canvas section's coordinates, for the toolbar. */
  const applyRectRef = useRef((m: Extract<FromBridge, { type: "rect" }>) => {
    const frame = frameRef.current?.getBoundingClientRect();
    const sec = sectionRef.current?.getBoundingClientRect();
    setSelBox(
      m.rect && frame && sec
        ? {
            top: m.rect.top + frame.top - sec.top,
            left: m.rect.left + frame.left - sec.left,
            width: m.rect.width,
            height: m.rect.height,
            frameTop: frame.top - sec.top,
            frameBottom: frame.bottom - sec.top,
            frameLeft: frame.left - sec.left,
            frameWidth: frame.width,
          }
        : null,
    );
  });

  /** Put the frame loading behind on screen, once it's ready (or loaded,
   *  for a store without the bridge). */
  const promote = useCallback((k: string) => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = null;
    // A newer edit replaced this frame while it loaded.
    if (k !== incomingKeyRef.current) return;
    setShownKey(k);
    const r = incomingRectRef.current;
    incomingRectRef.current = null;
    // Point at the new frame now, so its rect (and every later message) counts.
    frameRef.current = framesRef.current.get(k) ?? null;
    visibleKeyRef.current = k;
    incomingKeyRef.current = null;
    if (r) applyRectRef.current(r);
  }, []);
  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );
  /** To the page on screen and, while one loads behind it, that one too —
   *  so a selection or recolor made meanwhile survives the swap. */
  const postFrames = useCallback((m: Record<string, unknown>) => {
    const msg = { src: "site-edit", ...m };
    frameRef.current?.contentWindow?.postMessage(msg, "*");
    const k = incomingKeyRef.current;
    const inc = k ? framesRef.current.get(k) : null;
    if (inc && inc !== frameRef.current) inc.contentWindow?.postMessage(msg, "*");
  }, []);
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
      undoRef.current = [];
      redoRef.current = [];
      setHistoryLen({ undo: 0, redo: 0 });
      // A page that is one block (quiz, colors, collection words): select it,
      // so its form is ready in the panel.
      if (def.fixed && data.draft.length === 1 && !selectedRef.current) {
        setSelected(data.draft[0].id);
        selectedRef.current = data.draft[0].id;
      }
      setSaveState("saved");
      setFrameKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the page.");
    }
  }, [brand, slug, def.fixed]);

  useEffect(() => {
    load();
  }, [load]);

  // The site palette (the Colors page's draft) under each block's Colors.
  const [sitePalette, setSitePalette] = useState<BlockColors>({});
  useEffect(() => {
    if (slug === "theme" || !sitePageFor(brand, "theme")) return;
    let cancelled = false;
    call<PageState>(brand, "theme", "GET")
      .then((data) => {
        const t = data.draft.find((b) => b.type === "theme");
        if (!cancelled && t?.type === "theme") setSitePalette(t.palette);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brand, slug]);
  const palette = useMemo(() => {
    const t = slug === "theme" ? blocks.find((b) => b.type === "theme") : undefined;
    return themePalette(brand, t?.type === "theme" ? t.palette : sitePalette);
  }, [brand, slug, blocks, sitePalette]);

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
    // Whatever was queued is being saved now.
    timer.current = null;
    if (savingRef.current) {
      againRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    const reload = reloadRef.current;
    reloadRef.current = false;
    try {
      const res = await call<{ updatedAt: string | null; previewUrl: string | null }>(brand, slug, "PUT", {
        blocks: blocksRef.current,
      });
      setPage((p) => (p ? { ...p, updatedAt: res.updatedAt, previewUrl: res.previewUrl ?? p.previewUrl } : p));
      setSaveState("saved");
      if (reload) setFrameKey((k) => k + 1);
      onChanged();
    } catch (e) {
      reloadRef.current ||= reload;
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

  // ── undo / redo ────────────────────────────────────────────────────────
  // Snapshots of the page's sections. Edits to the same thing in quick
  // succession (typing a heading, dragging a color) are one step. Saved
  // sections (widgets) live outside the page, so they aren't covered.
  const undoRef = useRef<{ blocks: PageBlock[]; key?: string; at: number }[]>([]);
  const redoRef = useRef<PageBlock[][]>([]);
  const [historyLen, setHistoryLen] = useState({ undo: 0, redo: 0 });
  const syncHistory = useCallback(
    () => setHistoryLen({ undo: undoRef.current.length, redo: redoRef.current.length }),
    [],
  );

  const update = useCallback(
    (next: PageBlock[], opts?: { reload?: boolean; history?: string | false }) => {
      if (opts?.history !== false) {
        const stack = undoRef.current;
        const last = stack[stack.length - 1];
        const now = Date.now();
        if (opts?.history && last?.key === opts.history && now - last.at < 1500) last.at = now;
        else {
          stack.push({ blocks: blocksRef.current, key: opts?.history || undefined, at: now });
          if (stack.length > 100) stack.shift();
        }
        redoRef.current = [];
        syncHistory();
      }
      if (opts?.reload !== false) reloadRef.current = true;
      setBlocks(next);
      blocksRef.current = next;
      setSaveState("dirty");
      setError(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 1200);
    },
    [save, syncHistory],
  );

  const stepHistory = useCallback(
    (dir: "undo" | "redo") => {
      const from = dir === "undo" ? undoRef.current : redoRef.current;
      const snap = from.pop();
      if (!snap) return;
      const blocksNow = blocksRef.current;
      if (dir === "undo") redoRef.current.push(blocksNow);
      else undoRef.current.push({ blocks: blocksNow, at: 0 });
      const target = "blocks" in snap ? snap.blocks : snap;
      syncHistory();
      update(target, { history: false });
      if (selectedRef.current && !target.some((x) => x.id === selectedRef.current)) {
        setSelected(null);
        selectedRef.current = null;
      }
    },
    [update, syncHistory],
  );

  // Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y — but not inside a text field, which
  // has its own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "y") {
        e.preventDefault();
        stepHistory(k === "y" || e.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepHistory]);

  // Esc closes the settings panel (dialogs on top handle their own Esc).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

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
      if (name !== "publish") {
        undoRef.current = [];
        redoRef.current = [];
        setHistoryLen({ undo: 0, redo: 0 });
      }
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
      postFrames({ type: "select", id: toCanvasId(id), scroll });
    },
    [toCanvasId, postFrames],
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
  const moveBy = (dir: -1 | 1) => update(move(blocks, currentIndex, currentIndex + dir));
  const duplicate = () => {
    if (!current) return;
    const id = uid(current.type);
    const next = [...blocks];
    next.splice(currentIndex + 1, 0, { ...structuredClone(current), id });
    update(next);
    select(id, false);
  };
  const toggleHidden = () =>
    current && update(blocks.map((x) => (x.id === current.id ? { ...x, hidden: !x.hidden || undefined } : x)));
  const saveAsWidget = async () => {
    if (!current || !currentInfo) return;
    const name = prompt("Name this saved section (only you see it):", currentInfo.label);
    if (!name?.trim()) return;
    const made = await w.create(name.trim(), current);
    if (!made) return;
    // This block becomes a link to the new widget.
    update(blocks.map((x) => (x.id === current.id ? { id: x.id, type: "widget", widgetId: made.id } : x)));
  };
  const removeCurrent = () => {
    if (!current) return;
    update(blocks.filter((x) => x.id !== current.id));
    select(null);
  };
  const canMoveUp = movable && currentIndex > pinnedCount;
  const canMoveDown = movable && currentIndex < blocks.length - 1;
  const canDuplicate = removable && !currentInfo?.single && blocks.length < LIMITS.blocks;
  const canWidget = !!current && removable && canBeWidget(current.type) && !w.notReady;

  // ── "+ Add section" ────────────────────────────────────────────────────
  const canAdd = !def.fixed && (addable.length > 0 || widgetTiles.length > 0);
  const [picker, setPicker] = useState<{ targetId: string | null; pos: "before" | "after" } | null>(null);
  const openPicker = (targetId: string | null, pos: "before" | "after") => setPicker({ targetId, pos });
  const closePicker = useCallback(() => setPicker(null), []);
  const pickerWhere = (() => {
    if (!picker) return "";
    const t = blocks.find((x) => x.id === picker.targetId);
    if (!t) return "It goes at the end of the page.";
    const name = t.type === "widget" ? (widgetById.get(t.widgetId)?.name ?? "Saved section") : BLOCK_INFO[t.type].label;
    return `It goes ${picker.pos === "before" ? "above" : "below"} “${name}”.`;
  })();

  // ── canvas bridge ──────────────────────────────────────────────────────
  const labels = useMemo(
    () => ({
      "__site:announcement": "Announcement bar (every page)",
      "__site:footer": "Footer (every page)",
      ...Object.fromEntries(
        blocks.map((x) => [
          toCanvasId(x.id) ?? x.id,
          x.type === "widget" ? `Saved section · ${widgetById.get(x.widgetId)?.name ?? "missing"}` : BLOCK_INFO[x.type].label,
        ]),
      ),
    }),
    [blocks, toCanvasId, widgetById],
  );
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
    postFrames({ type: "labels", labels });
  }, [labels, postFrames]);

  // ── on-page editing ────────────────────────────────────────────────────
  const wRef = useRef(w);
  useEffect(() => {
    wRef.current = w;
  }, [w]);
  /** A canvas id ("__site:footer" on the Header & footer page) → block id. */
  const fromCanvasId = useCallback(
    (id: string) =>
      id.startsWith("__site:")
        ? (blocksRef.current.find((x) => x.type === id.slice("__site:".length))?.id ?? id)
        : id,
    [],
  );
  /** Set a field of a block (or of the widget a block links to). */
  const setField = useCallback(
    (canvasId: string, path: string, value: string, reload: boolean) => {
      const id = fromCanvasId(canvasId);
      const list = blocksRef.current;
      const b = list.find((x) => x.id === id);
      if (!b) return;
      if (b.type === "widget") {
        const draft = wRef.current.widgets.find((x) => x.id === b.widgetId)?.draft;
        const next = draft ? setBlockPath(draft, path, value) : null;
        if (next) wRef.current.updateDraft(b.widgetId, next, !reload);
        return;
      }
      // List positions on the page are those of the saved (normalized) block —
      // empty items are dropped there — so resolve the path against that.
      const shown = normalizeSitePage(brand, slug, [b])?.find((x) => x.id === id) ?? b;
      const next = setBlockPath(shown, path, value);
      if (!next) return;
      if (!reload && CLIENT_DRAWN.has(b.type)) reloadOnStopRef.current = true;
      update(list.map((x) => (x.id === id ? next : x)), { reload, history: `field:${id}:${path}` });
    },
    [fromCanvasId, update, brand, slug],
  );
  const postToCanvas = (m: Record<string, unknown>) =>
    postFrames(m);
  /** A block's own colors: saved, and shown on the canvas without a reload. */
  const setColors = (id: string, colors: BlockColors | undefined) => {
    update(
      blocksRef.current.map((x) => {
        if (x.id !== id) return x;
        const { colors: _old, ...rest } = x;
        void _old;
        return (colors ? { ...rest, colors } : rest) as PageBlock;
      }),
      { reload: false, history: `colors:${id}` },
    );
    postToCanvas({ type: "style", id: toCanvasId(id), colors: colors ?? null });
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromBridge>) => {
      // Only our canvas frame — matched by window, not origin, so a store
      // that redirects (www ↔ apex) still talks to the editor.
      if (e.data?.src !== "site-edit") return;
      const m = e.data;
      // The frame loading behind the visible one: set it up like the old
      // one (labels, scroll, selection), then swap it in. Nothing else from
      // it counts until then — nobody can click it.
      const incomingKey = incomingKeyRef.current;
      const incoming = incomingKey ? framesRef.current.get(incomingKey) : null;
      if (incoming && e.source === incoming.contentWindow) {
        if (m.type === "ready") {
          setBridgeFrame(frameKeyRef.current);
          const w = incoming.contentWindow;
          w?.postMessage({ src: "site-edit", type: "labels", labels: labelsRef.current }, "*");
          w?.postMessage({ src: "site-edit", type: "restore", y: canvasScrollRef.current }, "*");
          w?.postMessage({ src: "site-edit", type: "select", id: toCanvasId(selectedRef.current), scroll: false }, "*");
          // A beat for the scroll and outlines to land before it shows.
          if (swapTimer.current) clearTimeout(swapTimer.current);
          swapTimer.current = setTimeout(() => promote(incomingKey!), 180);
        } else if (m.type === "rect") {
          incomingRectRef.current = m;
        }
        return;
      }
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
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
        // On the Colors page the header and footer are just part of the sample.
        if (!id && list.length === 1 && list[0].type === "theme") {
          id = list[0].id;
          hint = null;
        }
        setSelected(id);
        selectedRef.current = id;
        setSiteHint(hint);
        if (id || hint) setTab("block");
        if (hint) setPanelOpen(true);
        if (toCanvasId(id) !== m.id && !hint) {
          frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "select", id: toCanvasId(id), scroll: false }, "*");
        }
      } else if (m.type === "drop") {
        insert(m.blockType as PageBlockType, m.targetId, m.pos, m.widgetId);
      } else if (m.type === "edit") {
        setField(m.id, m.path, m.value, false);
      } else if (m.type === "editing") {
        // Typing into something this page doesn't own (the footer on the
        // homepage): stop, and point to where it's edited.
        if (m.id && !blocksRef.current.some((x) => x.id === fromCanvasId(m.id!))) {
          frameRef.current?.contentWindow?.postMessage({ src: "site-edit", type: "stopEditing" }, "*");
          if (m.id.startsWith("__site:")) {
            setSiteHint(m.id.slice("__site:".length));
            setPanelOpen(true);
          }
          return;
        }
        setEditing(m.kind);
        if (!m.kind && reloadOnStopRef.current) {
          reloadOnStopRef.current = false;
          reloadRef.current = true;
          // Nothing queued to save it: reload now (or after the save in flight).
          if (!timer.current) {
            if (savingRef.current) againRef.current = true;
            else {
              reloadRef.current = false;
              setFrameKey((k) => k + 1);
            }
          }
        }
      } else if (m.type === "image") {
        setImagePick({ id: m.id, path: m.path });
      } else if (m.type === "rect") {
        applyRectRef.current(m);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [insert, toCanvasId, setField, fromCanvasId, promote]);

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

  // What Publish would change, for the "N changes not live" pill and review.
  const [review, setReview] = useState(false);
  const closeReview = useCallback(() => setReview(false), []);
  const changes = useMemo(() => {
    if (!page) return [];
    const labelFor = (b: PageBlock) =>
      b.type === "widget" ? (widgetById.get(b.widgetId)?.name ?? "Saved section") : BLOCK_INFO[b.type].label;
    const seen = new Set<string>();
    const savedEdits = blocks.flatMap((x) => {
      if (x.type !== "widget" || seen.has(x.widgetId)) return [];
      seen.add(x.widgetId);
      const wd = widgetById.get(x.widgetId);
      if (!wd || JSON.stringify(wd.draft) === JSON.stringify(wd.published)) return [];
      return [{ name: wd.name, otherPages: wd.usedOn.filter((u) => u.slug !== slug).map((u) => u.label) }];
    });
    return diffPage(page.published ?? def.defaults, blocks, labelFor, savedEdits);
  }, [page, blocks, widgetById, def.defaults, slug]);

  const partParam = slug === "product" && previewPart ? `&part=${encodeURIComponent(previewPart)}` : "";
  const previewSrc = page?.previewUrl ? `${page.previewUrl}&bare=1&edit=1${partParam}&v=${frameKey}` : null;
  // The frame on screen vs the one wanted now: already shown → settled; same
  // device but different → the wanted one loads behind ("updating"); nothing
  // shown yet or the device switched → it loads in place ("first loading").
  const wantedKey = previewSrc ? `${device}|${previewSrc}` : null;
  const buffered = !!wantedKey && !!shownKey && shownKey !== wantedKey && shownKey.startsWith(`${device}|`);
  const visibleKey = buffered ? shownKey : wantedKey;
  const frameKeys = wantedKey ? (buffered ? [shownKey!, wantedKey] : [wantedKey]) : [];
  const firstLoading = !!wantedKey && !buffered && shownKey !== wantedKey;
  const updating = buffered;
  const canvasLoading = firstLoading;
  useEffect(() => {
    visibleKeyRef.current = visibleKey;
    incomingKeyRef.current = buffered ? wantedKey : null;
    frameRef.current = (visibleKey && framesRef.current.get(visibleKey)) || null;
  });
  const onFrameLoad = (k: string) => {
    if (k === incomingKeyRef.current) {
      // No word from the bridge soon after loading: swap anyway.
      if (!swapTimer.current) swapTimer.current = setTimeout(() => promote(k), 1500);
    } else if (k === wantedKey) {
      setShownKey(k);
    }
  };
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
        <button
          type="button"
          onClick={async () => {
            await flush();
            onHome();
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronLeft size={15} /> All pages
        </button>
        <span className="h-4 w-px bg-gray-200" />
        {/* Only with the top switch on All — otherwise that switch is the store picker. */}
        {filter === "all" ? (
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
        ) : null}
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
        <div className="flex items-center">
          <IconButton label="Undo (Ctrl+Z)" disabled={!historyLen.undo} onClick={() => stepHistory("undo")}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!historyLen.redo} onClick={() => stepHistory("redo")}>
            <Redo2 size={14} />
          </IconButton>
        </div>
        <SaveBadge state={saveState} />

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
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
          <IconButton label="Reload the page preview" onClick={() => setFrameKey((k) => k + 1)}>
            {canvasLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </IconButton>
          <TextButton
            active={panelOpen && tab === "page"}
            onClick={() => {
              if (panelOpen && tab === "page") setPanelOpen(false);
              else {
                setTab("page");
                setPanelOpen(true);
              }
            }}
          >
            <PanelTop size={14} /> Page settings
          </TextButton>
          {page?.previewUrl ? (
            <a
              href={`${page.previewUrl}${partParam}`}
              target="_blank"
              rel="noreferrer"
              title="Open the draft in a new tab, as a visitor would see it"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <ExternalLink size={14} /> Preview
            </a>
          ) : null}
          <span className="mx-0.5 hidden h-5 w-px bg-gray-200 sm:block" />
          {/* Where this page stands, in words: what's live, and what isn't yet. */}
          {unpublished ? (
            <button
              type="button"
              onClick={() => setReview(true)}
              disabled={!!busy || page?.notReady}
              title="See what will change on the live site"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {!page?.publishedAt
                ? "Not live yet"
                : `${changes.length || 1} ${changes.length === 1 ? "change" : "changes"} not live`}
            </button>
          ) : page?.publishedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live · {when(page.publishedAt)}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">Showing the original page</span>
          )}
          <button
            type="button"
            disabled={!!busy || page?.notReady || !unpublished}
            onClick={() => setReview(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
          >
            {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : null}
            {unpublished ? "Publish…" : "Published"}
          </button>
        </div>
      </header>

      {page?.notReady || error ? (
        <div className="flex gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error ?? page?.hint}</span>
        </div>
      ) : null}

      <div
        // The settings panel slides over the page preview instead of squeezing it.
        className="relative grid min-h-0 flex-1 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]"
      >
        {/* ── sections on this page ────────────────────────────────────── */}
        <aside className="min-h-0 space-y-4 overflow-y-auto border-b border-gray-100 bg-gray-50/60 p-4 md:border-b-0 md:border-r">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Sections on this page</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {def.fixed ? "This page's layout is fixed — click any words on it to change them." : "Drag to reorder. Click one to edit it."}
            </p>
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
                      <span title="Built by the store — you can change its words, not move or remove it." className="shrink-0">
                        <Lock size={11} className="text-gray-300" />
                      </span>
                    )}
                    <Icon size={13} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate" title={summary(x)}>
                      {x.type === "widget" ? widgetById.get(x.widgetId)?.name ?? "Missing saved section" : info.label}
                    </span>
                    {x.hidden ? <EyeOff size={12} className="shrink-0 text-gray-400" /> : null}
                  </li>
                );
              })}
            </ul>
          </div>

          {canAdd ? (
            <button
              type="button"
              onClick={() => openPicker(selectedRef.current ?? blocks[blocks.length - 1]?.id ?? null, "after")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2.5 text-sm font-medium text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
            >
              <Plus size={15} /> Add section
            </button>
          ) : null}
        </aside>

        {/* ── canvas ───────────────────────────────────────────────────── */}
        <section ref={sectionRef} className="relative flex min-h-[60vh] min-w-0 justify-center overflow-hidden bg-gray-100 p-4">
          {bridgeMissing ? (
            <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-lg bg-gray-900/90 px-3 py-2 text-[11px] text-white shadow-lg">
              Clicking the page to select isn&apos;t connected — pick parts from “On this page” on the left.
            </div>
          ) : null}
          {previewSrc ? (
            // Two frames while the page updates: the new draft loads behind
            // the one on screen and swaps in once it's scrolled into place,
            // so an edit never shows a blank or jumping page.
            <div className={clsx("relative h-full", device === "mobile" ? "w-[390px]" : "w-full")}>
              {frameKeys.map((k) => {
                const visible = k === visibleKey;
                return (
                  <iframe
                    key={k}
                    ref={(el) => {
                      if (el) framesRef.current.set(k, el);
                      else framesRef.current.delete(k);
                    }}
                    src={k.slice(k.indexOf("|") + 1)}
                    title={visible ? `${def.label} — draft` : `${def.label} — updating`}
                    tabIndex={visible ? undefined : -1}
                    aria-hidden={visible ? undefined : true}
                    onLoad={() => onFrameLoad(k)}
                    className={clsx(
                      "absolute inset-0 h-full w-full rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity",
                      visible ? "z-[1]" : "pointer-events-none z-0",
                      visible && firstLoading && "opacity-70",
                    )}
                  />
                );
              })}
              {updating ? (
                <div className="pointer-events-none absolute right-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full bg-gray-900/75 px-2.5 py-1 text-[10px] font-medium text-white shadow">
                  <Loader2 size={11} className="animate-spin" /> Updating
                </div>
              ) : null}
            </div>
          ) : (
            <div className="m-auto max-w-sm text-center text-sm text-gray-500">
              The canvas needs the store connection (SUPABASE_SERVICE_ROLE_KEY) — your edits still save.
            </div>
          )}
          {current && currentInfo && selBox && !canvasLoading && toolbarPos(selBox) ? (
            <CanvasToolbar
              key={current.id}
              pos={toolbarPos(selBox)!}
              label={current.type === "widget" ? (widgetById.get(current.widgetId)?.name ?? "Saved section") : currentInfo.label}
              editing={editing}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              canDuplicate={canDuplicate}
              canHide={removable}
              hidden={!!current.hidden}
              canDelete={removable}
              canWidget={canWidget}
              showColors={!NO_COLORS.has(current.type)}
              colorsCount={Object.keys(current.colors ?? {}).length}
              colorsPanel={
                <BlockColorsPanel
                  bare
                  brand={brand}
                  colors={current.colors}
                  palette={palette}
                  onChange={(colors) => setColors(current.id, colors)}
                />
              }
              onMove={moveBy}
              onDuplicate={duplicate}
              onToggleHidden={toggleHidden}
              onWidget={saveAsWidget}
              onDelete={removeCurrent}
              onSettings={() => {
                setTab("block");
                setPanelOpen(true);
              }}
              onFormat={(cmd: FormatCmd, value?: string) => postToCanvas({ type: "format", cmd, value })}
            />
          ) : null}
          {current && currentInfo && selBox && !canvasLoading && canAdd && !editing
            ? (
                [
                  ["before", selBox.top] as const,
                  ["after", selBox.top + selBox.height] as const,
                ]
              )
                // Nothing goes above a section pinned to the top of the page.
                .filter(([pos, y]) => !(pos === "before" && currentInfo.pinned) && y > selBox.frameTop + 24 && y < selBox.frameBottom - 16)
                .map(([pos, y]) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => openPicker(current.id, pos)}
                    style={{
                      top: y,
                      left: Math.min(
                        Math.max(selBox.left + selBox.width / 2, selBox.frameLeft + 80),
                        selBox.frameLeft + selBox.frameWidth - 80,
                      ),
                    }}
                    className="absolute z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold text-white shadow-lg ring-2 ring-white transition hover:bg-indigo-700"
                  >
                    <Plus size={12} /> Add section {pos === "before" ? "above" : "below"}
                  </button>
                ))
            : null}
          {previewSrc && showHint && !selected && !canvasLoading && !bridgeMissing ? (
            <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/80 px-3.5 py-1.5 text-[11px] text-white shadow">
              Click any words to type over them · click a section for its options and “+ Add section”
            </div>
          ) : null}
        </section>
        <MediaLibraryModal
          open={!!imagePick}
          onClose={() => setImagePick(null)}
          onSelect={(url) => {
            if (imagePick) setField(imagePick.id, imagePick.path, url, true);
            setImagePick(null);
          }}
          uploader={uploadBlogImageResult}
          inbox="website-uploads"
        />
        <SectionPicker
          open={!!picker}
          where={pickerWhere}
          types={addable}
          saved={widgetTiles}
          onClose={closePicker}
          onPick={(type, widgetId) => {
            if (picker) insert(type, picker.targetId, picker.pos, widgetId);
            setPicker(null);
          }}
        />
        <PublishReview
          open={review}
          page={def.label}
          host={host}
          firstPublish={!page?.publishedAt}
          changes={changes}
          busy={busy === "publish"}
          onClose={closeReview}
          onPublish={async () => {
            await action("publish");
            setReview(false);
          }}
        />

        {/* ── side panel (Settings / Page settings), sliding over the page ── */}
        {panelOpen ? (
        <aside className="animate-slide-in-right absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-gray-200 bg-white shadow-2xl sm:w-[380px]">
          <div className="sticky top-0 z-[1] flex gap-1 border-b border-gray-100 bg-white p-2">
            {(
              [
                ["block", "Section", <Settings2 key="b" size={12} />],
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
            <IconButton label="Close panel" onClick={() => setPanelOpen(false)}>
              <X size={14} />
            </IconButton>
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
                onAction={(name, versionId) => (name === "publish" ? setReview(true) : action(name, versionId))}
                widgets={w.widgets}
                onRenameWidget={w.rename}
                onDeleteWidget={(id) => {
                  if (confirm("Delete this saved section? Only possible when no page uses it.")) void w.remove(id);
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
                  <IconButton label="Move up" disabled={!canMoveUp} onClick={() => moveBy(-1)}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton label="Move down" disabled={!canMoveDown} onClick={() => moveBy(1)}>
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton label="Duplicate" disabled={!canDuplicate} onClick={duplicate}>
                    <Copy size={14} />
                  </IconButton>
                  <IconButton
                    label={current.hidden ? "Show on site" : "Hide from site"}
                    disabled={!removable}
                    onClick={toggleHidden}
                  >
                    {current.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </IconButton>
                  <IconButton
                    label="Save as a reusable section"
                    disabled={!canWidget}
                    onClick={saveAsWidget}
                  >
                    <Puzzle size={14} />
                  </IconButton>
                  <span className="flex-1" />
                  <IconButton
                    label="Delete"
                    danger
                    disabled={!removable}
                    onClick={removeCurrent}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                {current.hidden ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    Hidden — not shown on the site. Find it in “Sections on this page” on the left.
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
                    onChange={(nb) => update(blocks.map((x) => (x.id === nb.id ? nb : x)), { history: `panel:${nb.id}` })}
                  />
                  )}
                  {NO_COLORS.has(current.type) ? null : (
                    <BlockColorsPanel
                      key={`colors:${current.id}`}
                      brand={brand}
                      colors={current.colors}
                      palette={palette}
                      onChange={(colors) => setColors(current.id, colors)}
                    />
                  )}
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-xs leading-relaxed text-gray-400">
                Click any part of the page to edit it,
                <br />
                or use “+ Add section”.
              </p>
            )}
          </div>
        </aside>
        ) : null}
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
          <Puzzle size={11} /> Saved sections (this store)
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
                  <IconButton label="Delete saved section" danger disabled={x.usedOn.length > 0} onClick={() => onDeleteWidget(x.id)}>
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
          <p className="mt-2 text-[11px] text-gray-400">None yet. Select a section and choose “Save as a reusable section”.</p>
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
        This saved section no longer exists (it was deleted). Delete it from the page.
      </p>
    );
  }
  const others = widget.usedOn.filter((u) => u.slug !== slug);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
          <Puzzle size={11} /> Saved section · {BLOCK_INFO[widget.draft.type].label}
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

/** A top-bar button that says what it does. */
function TextButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
        active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      )}
    >
      {children}
    </button>
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
