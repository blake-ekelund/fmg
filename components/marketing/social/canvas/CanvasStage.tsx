"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CanvasView from "@/lib/social/CanvasView";
import EditableText from "./EditableText";
import { CANVAS_H, CANVAS_W, type CanvasSlide, type Layer } from "@/lib/social/canvas";

/**
 * The editable canvas: the slide drawn by CanvasView at `width` px, with a
 * selection layer on top. Click to select, drag to move (snaps to the slide
 * centre/edges and other layers), drag handles to resize, the top knob to
 * rotate, double-click text to type on the slide.
 *
 * Drags preview locally and commit once on release, so one drag = one undo.
 */

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { h: Handle; dx: -1 | 0 | 1; dy: -1 | 0 | 1; cursor: string }[] = [
  { h: "nw", dx: -1, dy: -1, cursor: "nwse-resize" },
  { h: "n", dx: 0, dy: -1, cursor: "ns-resize" },
  { h: "ne", dx: 1, dy: -1, cursor: "nesw-resize" },
  { h: "e", dx: 1, dy: 0, cursor: "ew-resize" },
  { h: "se", dx: 1, dy: 1, cursor: "nwse-resize" },
  { h: "s", dx: 0, dy: 1, cursor: "ns-resize" },
  { h: "sw", dx: -1, dy: 1, cursor: "nesw-resize" },
  { h: "w", dx: -1, dy: 0, cursor: "ew-resize" },
];

const SNAP = 10; // slide px

type Drag =
  | { kind: "move"; id: string; startX: number; startY: number; orig: Layer }
  | { kind: "resize"; id: string; handle: (typeof HANDLES)[number]; startX: number; startY: number; orig: Layer; ratio: number }
  | { kind: "rotate"; id: string; cx: number; cy: number; orig: Layer };

type Props = {
  slide: CanvasSlide;
  index: number;
  total: number;
  width: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Commit a change to one layer (one undo step). */
  onChange: (id: string, patch: Partial<Layer>) => void;
  /** Live text typing on the canvas (coalesced into one undo step by the caller). */
  onText: (id: string, text: string) => void;
  editingId: string | null;
  onEditing: (id: string | null) => void;
};

export default function CanvasStage(p: Props) {
  const scale = p.width / CANVAS_W;
  const viewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; patch: Partial<Layer> } | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [heights, setHeights] = useState<Record<string, number>>({});

  // Layers with the in-progress drag applied.
  const layers = p.slide.layers.map((l) => (preview && preview.id === l.id ? ({ ...l, ...preview.patch } as Layer) : l));
  const shown: CanvasSlide = { ...p.slide, layers };

  // Text boxes grow with their text — watch their size for the selection outline.
  const layerKey = layers.map((l) => l.id).join(",");
  useEffect(() => {
    const root = viewRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-layer-id]").forEach((el) => {
        next[el.dataset.layerId!] = el.offsetHeight;
      });
      setHeights((cur) => {
        const same = Object.keys(next).length === Object.keys(cur).length && Object.entries(next).every(([k, v]) => cur[k] === v);
        return same ? cur : next;
      });
    });
    root.querySelectorAll<HTMLElement>("[data-layer-id]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [layerKey, p.editingId]);

  const hOf = useCallback((l: Layer) => (l.type === "text" ? heights[l.id] ?? l.h : l.h), [heights]);

  /* ── Pointer handling ──────────────────────────────────────── */

  function toSlide(e: { clientX: number; clientY: number }) {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function startMove(e: React.PointerEvent, l: Layer) {
    if (p.editingId === l.id) return;
    e.stopPropagation();
    p.onSelect(l.id);
    if (l.locked) return;
    const pt = toSlide(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "move", id: l.id, startX: pt.x, startY: pt.y, orig: l });
  }

  function startResize(e: React.PointerEvent, l: Layer, handle: (typeof HANDLES)[number]) {
    e.stopPropagation();
    const pt = toSlide(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "resize", id: l.id, handle, startX: pt.x, startY: pt.y, orig: { ...l, h: hOf(l) }, ratio: hOf(l) / l.w });
  }

  function startRotate(e: React.PointerEvent, l: Layer) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "rotate", id: l.id, cx: l.x + l.w / 2, cy: l.y + hOf(l) / 2, orig: l });
  }

  function snapMove(l: Layer, x: number, y: number) {
    const h = hOf(l);
    const xs = [0, CANVAS_W / 2, CANVAS_W];
    const ys = [0, CANVAS_H / 2, CANVAS_H];
    for (const o of p.slide.layers) {
      if (o.id === l.id || o.hidden) continue;
      const oh = hOf(o);
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + oh / 2, o.y + oh);
    }
    const gx: number[] = [];
    const gy: number[] = [];
    let bestX: { d: number; v: number; g: number } | null = null;
    for (const [off] of [[0], [l.w / 2], [l.w]]) {
      for (const t of xs) {
        const d = Math.abs(x + off - t);
        if (d < SNAP && (!bestX || d < bestX.d)) bestX = { d, v: t - off, g: t };
      }
    }
    let bestY: { d: number; v: number; g: number } | null = null;
    for (const [off] of [[0], [h / 2], [h]]) {
      for (const t of ys) {
        const d = Math.abs(y + off - t);
        if (d < SNAP && (!bestY || d < bestY.d)) bestY = { d, v: t - off, g: t };
      }
    }
    if (bestX) {
      x = bestX.v;
      gx.push(bestX.g);
    }
    if (bestY) {
      y = bestY.v;
      gy.push(bestY.g);
    }
    return { x: Math.round(x), y: Math.round(y), gx, gy };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const pt = toSlide(e);
    const o = drag.orig;

    if (drag.kind === "move") {
      const s = snapMove(o, o.x + pt.x - drag.startX, o.y + pt.y - drag.startY);
      setGuides({ x: s.gx, y: s.gy });
      setPreview({ id: drag.id, patch: { x: s.x, y: s.y } });
      return;
    }

    if (drag.kind === "rotate") {
      let deg = (Math.atan2(pt.y - drag.cy, pt.x - drag.cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      // Snap to 0 / 45 / 90… within 4°, or every 15° with Shift.
      const step = e.shiftKey ? 15 : 45;
      const near = Math.round(deg / step) * step;
      if (e.shiftKey || Math.abs(deg - near) < 4) deg = near;
      setPreview({ id: drag.id, patch: { rotation: Math.round(deg) } });
      return;
    }

    // resize, in the layer's own (rotated) frame
    const { handle } = drag;
    const th = (o.rotation * Math.PI) / 180;
    const dxw = pt.x - drag.startX;
    const dyw = pt.y - drag.startY;
    const dx = dxw * Math.cos(th) + dyw * Math.sin(th);
    const dy = -dxw * Math.sin(th) + dyw * Math.cos(th);
    let w = Math.max(16, o.w + handle.dx * dx);
    let h = Math.max(4, o.h + handle.dy * dy);
    const corner = handle.dx !== 0 && handle.dy !== 0;
    const patch: Partial<Layer> = {};
    if (o.type === "text") {
      if (corner) {
        // Corners scale the text; sides only change the wrap width.
        const k = w / o.w;
        (patch as Partial<Extract<Layer, { type: "text" }>>).size = Math.max(6, Math.round(o.size * k));
        h = o.h * k;
      } else {
        h = o.h;
      }
    } else if (corner && (o.type === "image" || e.shiftKey)) {
      // Images keep their shape from the corners (Shift does it for shapes).
      h = w * drag.ratio;
    }
    w = Math.round(w);
    h = Math.round(h);
    const dw = w - o.w;
    const dh = h - o.h;
    const lx = (handle.dx * dw) / 2;
    const ly = (handle.dy * dh) / 2;
    const cx = o.x + o.w / 2 + lx * Math.cos(th) - ly * Math.sin(th);
    const cy = o.y + o.h / 2 + lx * Math.sin(th) + ly * Math.cos(th);
    Object.assign(patch, { w, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) });
    if (o.type !== "text") Object.assign(patch, { h });
    setPreview({ id: drag.id, patch });
  }

  function onPointerUp() {
    if (drag && preview) p.onChange(preview.id, preview.patch);
    setDrag(null);
    setPreview(null);
    setGuides({ x: [], y: [] });
  }

  /* ── Keyboard ──────────────────────────────────────────────── */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (p.editingId || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const l = p.slide.layers.find((x) => x.id === p.selectedId);
      if (!l) return;
      if (e.key === "Escape") return p.onSelect(null);
      if (e.key === "Enter" && l.type === "text" && !l.locked) {
        e.preventDefault();
        return p.onEditing(l.id);
      }
      if (l.locked) return;
      const step = e.shiftKey ? 10 : 1;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) {
        e.preventDefault();
        p.onChange(l.id, { x: l.x + move[0], y: l.y + move[1] });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);

  const sel = layers.find((l) => l.id === p.selectedId) ?? null;

  return (
    <div
      ref={stageRef}
      className="relative select-none"
      style={{ width: p.width, height: CANVAS_H * scale, touchAction: "none" }}
      onPointerDown={() => {
        p.onSelect(null);
        p.onEditing(null);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* The slide itself */}
      <div
        ref={viewRef}
        className="absolute left-0 top-0 overflow-hidden shadow-lg"
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <CanvasView
          slide={shown}
          index={p.index}
          total={p.total}
          textureSrc={(id, tone) => `/textures/social/${id}-${tone}.png`}
          editing={
            p.editingId
              ? {
                  id: p.editingId,
                  render: (layer, style) => (
                    <EditableText layer={layer} style={style} onChange={(text) => p.onText(layer.id, text)} onDone={() => p.onEditing(null)} />
                  ),
                }
              : null
          }
        />
      </div>

      {/* Hit areas, top layer last so it wins */}
      {layers.map((l) =>
        l.hidden || l.id === p.editingId ? null : (
          <div
            key={l.id}
            onPointerDown={(e) => startMove(e, l)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (l.type === "text" && !l.locked) p.onEditing(l.id);
            }}
            className="absolute"
            style={{
              left: l.x * scale,
              top: l.y * scale,
              width: l.w * scale,
              height: hOf(l) * scale,
              transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
              cursor: l.locked ? "default" : "move",
            }}
          />
        ),
      )}

      {/* Snap guides */}
      {guides.x.map((g) => (
        <div key={`gx${g}`} className="pointer-events-none absolute top-0 w-px bg-fuchsia-500" style={{ left: g * scale, height: CANVAS_H * scale }} />
      ))}
      {guides.y.map((g) => (
        <div key={`gy${g}`} className="pointer-events-none absolute left-0 h-px bg-fuchsia-500" style={{ top: g * scale, width: p.width }} />
      ))}

      {/* Selection */}
      {sel && !sel.hidden && sel.id !== p.editingId && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: sel.x * scale,
            top: sel.y * scale,
            width: sel.w * scale,
            height: hOf(sel) * scale,
            transform: sel.rotation ? `rotate(${sel.rotation}deg)` : undefined,
            outline: `2px solid ${sel.locked ? "#9CA3AF" : "#7C3AED"}`,
            outlineOffset: 1,
          }}
        >
          {!sel.locked && (
            <>
              {HANDLES.filter((h) => sel.type !== "text" || h.dy === 0 || h.dx !== 0).map((h) => (
                <span
                  key={h.h}
                  onPointerDown={(e) => startResize(e, sel, h)}
                  className="pointer-events-auto absolute h-3 w-3 rounded-full border-2 border-violet-600 bg-white shadow"
                  style={{
                    left: `calc(${((h.dx + 1) / 2) * 100}% - 6px)`,
                    top: `calc(${((h.dy + 1) / 2) * 100}% - 6px)`,
                    cursor: h.cursor,
                  }}
                />
              ))}
              <span
                onPointerDown={(e) => startRotate(e, sel)}
                title="Rotate (hold Shift for 15° steps)"
                className="pointer-events-auto absolute left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-violet-600 bg-white shadow"
                style={{ top: -30, cursor: "grab" }}
              />
              <span className="absolute left-1/2 w-px -translate-x-1/2 bg-violet-600" style={{ top: -14, height: 12 }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
