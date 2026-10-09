"use client";

import { useEffect, useRef, useState } from "react";
import {
  CaseUpper,
  ChevronDown,
  ChevronRight,
  Circle,
  Heading1,
  Heading2,
  Image as ImageIcon,
  LayoutTemplate,
  Layers,
  Minus,
  Package,
  Palette,
  Pilcrow,
  Plus,
  RectangleVertical,
  Redo2,
  Square,
  Undo2,
} from "lucide-react";
import clsx from "clsx";
import {
  newImageLayer,
  newLayerId,
  newShapeLayer,
  newTextLayer,
  type CanvasBackground,
  type CanvasSlide,
  type Layer,
  type ShapeKind,
  type TextPreset,
  slideH,
  slideW,
} from "@/lib/social/canvas";
import { LAYOUTS, type SlideLayout } from "@/lib/social/design";
import type { SocialBrand } from "@/lib/social/types";
import CanvasStage from "./CanvasStage";
import CanvasInspector, { type ImageTarget, type LayerAction } from "./CanvasInspector";
import LayersPanel from "./LayersPanel";

/**
 * Editing one canvas slide: one "+ Add" menu (slides, text, photos, shapes,
 * background) and the stage in the middle, and the Design / Layers panel on
 * the right. The caption lives in its own card below (SocialPostBuilder). Renders two grid cells
 * (center + right) for the builder's three-column layout. Mount it with
 * key={slide.id} so selection resets when you switch slides.
 */

type Props = {
  brand: SocialBrand;
  slide: CanvasSlide;
  index: number;
  total: number;
  locked: boolean;
  onChange: (next: CanvasSlide, key?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Ask the builder for a photo (library/Unsplash or a product shot). */
  requestImage: (source: "library" | "product", onPicked: (url: string) => void) => void;
  /** Insert a new slide after this one. */
  onAddSlide: (layout: SlideLayout | "blank") => void;
  canAddSlide: boolean;
  problems: string[];
  /** Hide the "Slide" part of the Add menu (the grid picture editor has one canvas). */
  hideSlideMenu?: boolean;
  /** Widest the stage may get (default 620px). */
  maxStageWidth?: number;
  /** Drawn over the stage, not interactive. */
  stageOverlay?: (scale: number) => React.ReactNode;
};

let clipboard: Layer | null = null;

function naturalSize(url: string): Promise<{ w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

export default function CanvasEditor(p: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"design" | "layers">("design");
  const centerRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(460);
  const W = slideW(p.slide);
  const H = slideH(p.slide);
  const maxStage = p.maxStageWidth ?? 620;

  // Fit the stage to the space available.
  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const fit = () => {
      const byWidth = el.clientWidth - 48;
      const byHeight = (window.innerHeight - 250) * (W / H);
      setStageW(Math.max(280, Math.min(maxStage, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [W, H, maxStage]);

  const slide = p.slide;
  const selected = slide.layers.find((l) => l.id === selectedId) ?? null;

  const setLayers = (layers: Layer[], key?: string) => p.onChange({ ...slide, layers }, key);
  const patchLayer = (id: string, patch: Partial<Layer>, key?: string) =>
    setLayers(slide.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)), key ? `${id}:${key}` : undefined);
  const patchBg = (patch: Partial<CanvasBackground>, key?: string) => p.onChange({ ...slide, bg: { ...slide.bg, ...patch } }, key ? `bg:${key}` : undefined);

  function add(layer: Layer) {
    // New layers are made for one post; on a bigger canvas, drop them in the middle.
    if (slide.w || slide.h) layer = { ...layer, x: Math.round((W - layer.w) / 2), y: Math.round((H - layer.h) / 2) };
    setLayers([...slide.layers, layer]);
    setSelectedId(layer.id);
    setTab("design");
  }

  function addText(preset: TextPreset) {
    add(newTextLayer(p.brand, preset));
  }
  function addShape(kind: ShapeKind) {
    add(newShapeLayer(p.brand, kind));
  }
  function addPhoto(source: "library" | "product") {
    p.requestImage(source, async (url) => add(newImageLayer(url, await naturalSize(url))));
  }

  function act(a: LayerAction) {
    if (!selected) return;
    const i = slide.layers.findIndex((l) => l.id === selected.id);
    const rest = slide.layers.filter((l) => l.id !== selected.id);
    switch (a) {
      case "duplicate": {
        const copy = { ...selected, id: newLayerId(), x: selected.x + 24, y: selected.y + 24, locked: false };
        setLayers([...slide.layers.slice(0, i + 1), copy, ...slide.layers.slice(i + 1)]);
        setSelectedId(copy.id);
        return;
      }
      case "delete":
        setLayers(rest);
        setSelectedId(null);
        return;
      case "front":
        return setLayers([...rest, selected]);
      case "back":
        return setLayers([selected, ...rest]);
      case "forward":
        return move(selected.id, 1);
      case "backward":
        return move(selected.id, -1);
      case "lock":
        return patchLayer(selected.id, { locked: !selected.locked });
      case "fill":
        return patchLayer(selected.id, { x: 0, y: 0, w: W, h: H, rotation: 0 });
      case "toBackground":
        if (selected.type !== "image") return;
        p.onChange({ ...slide, layers: rest, bg: { ...slide.bg, image: selected.src, imageOpacity: selected.opacity } });
        setSelectedId(null);
        return;
    }
  }

  function move(id: string, dir: 1 | -1) {
    const i = slide.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= slide.layers.length) return;
    const next = [...slide.layers];
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  }

  function pickImage(target: ImageTarget, source: "library" | "product") {
    p.requestImage(source, async (url) => {
      if (target === "background") patchBg({ image: url });
      else if (target === "layer" && selected?.type === "image") patchLayer(selected.id, { src: url });
      else add(newImageLayer(url, await naturalSize(url)));
    });
  }

  // Keyboard shortcuts (not while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (editingId || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || p.locked) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        return e.shiftKey ? p.redo() : p.undo();
      }
      if (mod && k === "y") {
        e.preventDefault();
        return p.redo();
      }
      if (!selected) {
        if (mod && k === "v" && clipboard) {
          e.preventDefault();
          add({ ...clipboard, id: newLayerId(), x: clipboard.x + 24, y: clipboard.y + 24 });
        }
        return;
      }
      if (k === "delete" || k === "backspace") {
        e.preventDefault();
        if (!selected.locked) act("delete");
      } else if (mod && k === "d") {
        e.preventDefault();
        act("duplicate");
      } else if (mod && k === "c") {
        clipboard = selected;
      } else if (mod && k === "v" && clipboard) {
        e.preventDefault();
        add({ ...clipboard, id: newLayerId(), x: clipboard.x + 24, y: clipboard.y + 24 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      {/* Center: add bar + stage */}
      <div ref={centerRef} className="flex min-w-0 flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-[#f3f3f1] px-4 pb-6 pt-3">
        {!p.locked && (
          <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
            <AddMenu
              hideSlideMenu={p.hideSlideMenu}
              canAddSlide={p.canAddSlide}
              onText={addText}
              onPhoto={addPhoto}
              onShape={addShape}
              onSlide={p.onAddSlide}
              onBackground={() => {
                setSelectedId(null);
                setTab("design");
              }}
            />
            <span className="mx-1 h-6 w-px bg-gray-300" />
            <button type="button" title="Undo (Ctrl+Z)" onClick={p.undo} disabled={!p.canUndo} className="rounded-xl p-2 text-gray-700 hover:bg-white disabled:opacity-30">
              <Undo2 size={18} />
            </button>
            <button type="button" title="Redo (Ctrl+Shift+Z)" onClick={p.redo} disabled={!p.canRedo} className="rounded-xl p-2 text-gray-700 hover:bg-white disabled:opacity-30">
              <Redo2 size={18} />
            </button>
          </div>
        )}

        <CanvasStage
          slide={slide}
          index={p.index}
          total={p.total}
          width={stageW}
          selectedId={p.locked ? null : selectedId}
          onSelect={(id) => {
            if (p.locked) return;
            setSelectedId(id);
          }}
          onChange={(id, patch) => patchLayer(id, patch)}
          onText={(id, text) => patchLayer(id, { text }, "type")}
          editingId={p.locked ? null : editingId}
          onEditing={setEditingId}
          overlay={p.stageOverlay}
        />

        {!p.locked && p.problems.length > 0 && (
          <ul className="w-full max-w-md space-y-0.5 text-xs text-amber-700">
            {p.problems.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Right panel */}
      <div className="min-w-0 rounded-2xl border border-gray-200 bg-white">
        <div className="flex border-b border-gray-100 p-1">
          {(
            [
              ["design", <Palette key="d" size={14} />, "Design"],
              ["layers", <Layers key="l" size={14} />, "Layers"],
            ] as const
          ).map(([t, icon, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                tab === t ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-800",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        {/* min-w-0: a fieldset won't shrink below its content otherwise, pushing rows off the panel */}
        <fieldset disabled={p.locked} className="max-h-[calc(100vh-220px)] min-w-0 overflow-y-auto disabled:opacity-70">
          {tab === "design" && (
            <CanvasInspector
              brand={p.brand}
              slide={slide}
              layer={selected}
              onLayer={patchLayer}
              onBackground={patchBg}
              onAction={act}
              onPickImage={(t) => pickImage(t, "library")}
              onPickProduct={(t) => pickImage(t, "product")}
            />
          )}
          {tab === "layers" && (
            <LayersPanel slide={slide} selectedId={selectedId} onSelect={setSelectedId} onLayer={(id, patch) => patchLayer(id, patch)} onMove={move} />
          )}
        </fieldset>
      </div>
    </>
  );
}

/* ─── The one "+ Add" menu ───────────────────────────────────────── */

function AddMenu({
  hideSlideMenu,
  canAddSlide,
  onText,
  onPhoto,
  onShape,
  onSlide,
  onBackground,
}: {
  hideSlideMenu?: boolean;
  canAddSlide: boolean;
  onText: (p: TextPreset) => void;
  onPhoto: (s: "library" | "product") => void;
  onShape: (k: ShapeKind) => void;
  onSlide: (l: SlideLayout | "blank") => void;
  onBackground: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    setLayouts(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
      >
        <Plus size={16} /> Add
        <ChevronDown size={14} className="text-white/60" />
      </button>
      {open && (
        <div className="absolute left-1/2 z-40 mt-2 w-[340px] -translate-x-1/2 rounded-2xl border border-gray-200 bg-white p-3 shadow-2xl">
          <MenuHeading>Text</MenuHeading>
          <div className="grid grid-cols-4 gap-1.5">
            <Tile icon={<Heading1 size={18} />} label="Heading" onClick={run(() => onText("heading"))} />
            <Tile icon={<Heading2 size={18} />} label="Subhead" onClick={run(() => onText("subheading"))} />
            <Tile icon={<Pilcrow size={18} />} label="Body" onClick={run(() => onText("body"))} />
            <Tile icon={<CaseUpper size={18} />} label="Label" onClick={run(() => onText("label"))} />
          </div>

          <div className="mt-3">
            <MenuHeading>Photo</MenuHeading>
            <div className="grid grid-cols-2 gap-1.5">
              <Tile icon={<ImageIcon size={18} />} label="From the library" onClick={run(() => onPhoto("library"))} />
              <Tile icon={<Package size={18} />} label="Product photo" onClick={run(() => onPhoto("product"))} />
            </div>
          </div>

          <div className="mt-3">
            <MenuHeading>Shape</MenuHeading>
            <div className="grid grid-cols-4 gap-1.5">
              <Tile icon={<Square size={18} />} label="Rectangle" onClick={run(() => onShape("rect"))} />
              <Tile icon={<Circle size={18} />} label="Circle" onClick={run(() => onShape("ellipse"))} />
              <Tile icon={<RectangleVertical size={18} />} label="Arch" onClick={run(() => onShape("arch"))} />
              <Tile icon={<Minus size={18} />} label="Line" onClick={run(() => onShape("line"))} />
            </div>
          </div>

          <div className="mt-3 border-t border-gray-100 pt-3">
            <MenuHeading>{hideSlideMenu ? "Picture" : "Slide"}</MenuHeading>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={run(onBackground)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                <Palette size={16} className="text-gray-500" /> Change the background
              </button>
              {!hideSlideMenu && (
              <>
              <button
                type="button"
                disabled={!canAddSlide}
                onClick={run(() => onSlide("blank"))}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
              >
                <Plus size={16} className="text-gray-500" /> New blank slide
              </button>
              <button
                type="button"
                disabled={!canAddSlide}
                onClick={() => setLayouts((v) => !v)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-40"
              >
                <LayoutTemplate size={16} className="text-gray-500" /> New slide from a layout
                <ChevronRight size={14} className={clsx("ml-auto text-gray-400 transition", layouts && "rotate-90")} />
              </button>
              {layouts && (
                <div className="ml-7 space-y-0.5 border-l border-gray-100 pl-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={run(() => onSlide(l.value))}
                      className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                    >
                      <span className="block text-sm text-gray-800">{l.label}</span>
                      <span className="block text-[11px] text-gray-400">{l.hint}</span>
                    </button>
                  ))}
                </div>
              )}
              {!canAddSlide && <p className="px-2 text-[11px] text-gray-400">A post can have up to 10 slides.</p>}
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 px-2 py-3 text-center text-xs font-medium text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-900"
    >
      <span className="text-gray-500">{icon}</span>
      {label}
    </button>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-1 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</div>;
}
