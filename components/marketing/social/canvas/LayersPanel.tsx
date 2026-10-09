"use client";

import { ArrowDown, ArrowUp, Circle, Eye, EyeOff, Image as ImageIcon, Lock, LockOpen, Sparkles, Square, Type } from "lucide-react";
import { STICKERS } from "@/lib/social/stickers";
import clsx from "clsx";
import type { CanvasSlide, Layer } from "@/lib/social/canvas";

/** Every layer on the slide, top first — select, show/hide, lock, reorder. */
export default function LayersPanel({
  slide,
  selectedId,
  onSelect,
  onLayer,
  onMove,
}: {
  slide: CanvasSlide;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayer: (id: string, patch: Partial<Layer>) => void;
  /** dir 1 = up (towards the front). */
  onMove: (id: string, dir: 1 | -1) => void;
}) {
  const top = [...slide.layers].reverse();
  return (
    <div className="p-2">
      {top.length === 0 && <p className="px-2 py-6 text-center text-sm text-gray-400">Nothing on this slide yet.</p>}
      <ul className="space-y-0.5">
        {top.map((l, i) => {
          const Icon =
            l.type === "text" ? Type : l.type === "image" ? ImageIcon : l.type === "sticker" ? Sparkles : l.shape === "ellipse" ? Circle : Square;
          return (
            <li
              key={l.id}
              onClick={() => onSelect(l.id)}
              className={clsx(
                "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                l.id === selectedId ? "bg-violet-50 text-violet-900" : "text-gray-700 hover:bg-gray-50",
                l.hidden && "opacity-50",
              )}
            >
              <Icon size={15} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">{label(l)}</span>
              <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                <Btn title="Move up" disabled={i === 0} onClick={() => onMove(l.id, 1)}><ArrowUp size={13} /></Btn>
                <Btn title="Move down" disabled={i === top.length - 1} onClick={() => onMove(l.id, -1)}><ArrowDown size={13} /></Btn>
                <Btn title={l.hidden ? "Show" : "Hide"} onClick={() => onLayer(l.id, { hidden: !l.hidden })}>
                  {l.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </Btn>
                <Btn title={l.locked ? "Unlock" : "Lock"} onClick={() => onLayer(l.id, { locked: !l.locked })}>
                  {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                </Btn>
              </span>
            </li>
          );
        })}
        <li
          onClick={() => onSelect(null)}
          className={clsx(
            "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
            selectedId === null ? "bg-violet-50 text-violet-900" : "text-gray-500 hover:bg-gray-50",
          )}
        >
          <span className="h-[15px] w-[15px] shrink-0 rounded border border-gray-300" style={{ background: slide.bg.color }} />
          Background
        </li>
      </ul>
    </div>
  );
}

function label(l: Layer): string {
  if (l.type === "text") {
    if (/\{n\}|\{total\}/.test(l.text)) return "Page number";
    return l.text.replace(/\s+/g, " ").trim().slice(0, 40) || "Text";
  }
  if (l.type === "image") return l.name && l.name !== "Photo" ? l.name : "Photo";
  if (l.type === "sticker") return STICKERS.find((s) => s.id === l.sticker)?.label ?? "Sticker";
  return { rect: "Rectangle", ellipse: "Circle", line: "Line", arch: "Arch" }[l.shape];
}

function Btn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-1 text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-20"
    >
      {children}
    </button>
  );
}
