"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Circle, Image as ImageIcon, Layers, Minus, Package, Palette, Redo2, Square, Type, Undo2 } from "lucide-react";
import clsx from "clsx";
import {
  CANVAS_H,
  CANVAS_W,
  newImageLayer,
  newLayerId,
  newShapeLayer,
  newTextLayer,
  type CanvasBackground,
  type CanvasSlide,
  type Layer,
  type ShapeKind,
  type TextPreset,
} from "@/lib/social/canvas";
import type { SocialBrand } from "@/lib/social/types";
import CanvasStage from "./CanvasStage";
import CanvasInspector, { type ImageTarget, type LayerAction } from "./CanvasInspector";
import LayersPanel from "./LayersPanel";

/**
 * Editing one canvas slide: the "Add" bar and the stage in the middle, and
 * the Design / Layers / Caption panel on the right. Renders two grid cells
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
  captionPanel: React.ReactNode;
  problems: string[];
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
  const [tab, setTab] = useState<"design" | "layers" | "caption">("design");
  const centerRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(460);

  // Fit the stage to the space available.
  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const fit = () => {
      const byWidth = el.clientWidth - 48;
      const byHeight = (window.innerHeight - 250) * (CANVAS_W / CANVAS_H);
      setStageW(Math.max(280, Math.min(620, byWidth, byHeight)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const slide = p.slide;
  const selected = slide.layers.find((l) => l.id === selectedId) ?? null;

  const setLayers = (layers: Layer[], key?: string) => p.onChange({ ...slide, layers }, key);
  const patchLayer = (id: string, patch: Partial<Layer>, key?: string) =>
    setLayers(slide.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)), key ? `${id}:${key}` : undefined);
  const patchBg = (patch: Partial<CanvasBackground>, key?: string) => p.onChange({ ...slide, bg: { ...slide.bg, ...patch } }, key ? `bg:${key}` : undefined);

  function add(layer: Layer) {
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
        return patchLayer(selected.id, { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rotation: 0 });
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
            <Menu
              icon={<Type size={16} />}
              label="Text"
              items={[
                { label: "Heading", hint: "Big and bold", onClick: () => addText("heading") },
                { label: "Subheading", onClick: () => addText("subheading") },
                { label: "Body text", onClick: () => addText("body") },
                { label: "Small label", hint: "SPACED CAPS", onClick: () => addText("label") },
              ]}
            />
            <Menu
              icon={<ImageIcon size={16} />}
              label="Photo"
              items={[
                { label: "From the library", hint: "Our photos + Unsplash", onClick: () => addPhoto("library") },
                { label: "Product photo", hint: "From the product pages", icon: <Package size={14} />, onClick: () => addPhoto("product") },
              ]}
            />
            <Menu
              icon={<Square size={16} />}
              label="Shape"
              items={[
                { label: "Rectangle", icon: <Square size={14} />, onClick: () => addShape("rect") },
                { label: "Circle", icon: <Circle size={14} />, onClick: () => addShape("ellipse") },
                { label: "Arch", hint: "Great as a photo frame", onClick: () => addShape("arch") },
                { label: "Line", icon: <Minus size={14} />, onClick: () => addShape("line") },
              ]}
            />
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setTab("design");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
            >
              <Palette size={16} /> Background
            </button>
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
            if (id) setTab((t) => (t === "caption" ? "design" : t));
          }}
          onChange={(id, patch) => patchLayer(id, patch)}
          onText={(id, text) => patchLayer(id, { text }, "type")}
          editingId={p.locked ? null : editingId}
          onEditing={setEditingId}
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
              ["caption", <Type key="c" size={14} />, "Caption"],
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
        <fieldset disabled={p.locked} className="max-h-[calc(100vh-220px)] overflow-y-auto disabled:opacity-70">
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
          {tab === "caption" && <div className="space-y-4 p-4">{p.captionPanel}</div>}
        </fieldset>
      </div>
    </>
  );
}

/* ─── Add menus ───────────────────────────────────────────────────── */

function Menu({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: { label: string; hint?: string; icon?: React.ReactNode; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
      >
        {icon}
        {label}
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-gray-50"
            >
              {it.icon && <span className="text-gray-500">{it.icon}</span>}
              <span>
                <span className="block text-sm text-gray-900">{it.label}</span>
                {it.hint && <span className="block text-[11px] text-gray-400">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
