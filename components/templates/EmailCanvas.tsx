"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Type, Image as ImageIcon, MousePointerClick, PanelTop, Minus, Rows3, Share2, ShoppingBag } from "lucide-react";
import { renderBlocksToEmailHtml } from "@/lib/email/renderBlocks";
import { SECTION_PRESETS } from "./types";
import type { EmailBlock, BlockType, SectionPreset } from "./types";

/** Block types offered by the inline "+ Add block" picker (section columns). */
const ADD_TYPES: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "header", label: "Heading", icon: PanelTop },
  { type: "product", label: "Product", icon: ShoppingBag },
  { type: "social", label: "Social", icon: Share2 },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Rows3 },
];

/**
 * The editing canvas, rendered from the EXACT HTML the email send produces
 * (renderBlocksToEmailHtml in editable mode) inside a same-origin iframe. Clicks
 * map back to blocks via data-block-id, so the editor is a true WYSIWYG of the
 * email — zero drift between "editor" and "what ships". Block properties are
 * edited in the side panel; a small floating toolbar handles move/delete.
 */

/** dataTransfer MIME the left palette sets when a block type is dragged out. */
export const NEW_BLOCK_MIME = "application/x-fmg-new";

// Injected into the iframe so blocks are clickable, selectable, and draggable.
const EDIT_CSS = `
  html,body{ -webkit-user-select:none; user-select:none; }
  [data-block-id]{ cursor:grab; }
  [data-block-id]:hover{ outline:2px dashed #93c5fd !important; outline-offset:-2px; }
  [data-block-id].__sel{ outline:2px solid #3b82f6 !important; outline-offset:-2px; }
  [data-block-id].__dragging{ opacity:0.4; }
  [data-block-id].__drop-before{ box-shadow: inset 0 4px 0 -1px #2563eb !important; }
  [data-block-id].__drop-after{ box-shadow: inset 0 -4px 0 -1px #2563eb !important; }
  [data-add-col].__drop-col{ outline:2px solid #2563eb !important; outline-offset:-2px; background:#eff6ff !important; }
`;

type Rect = { top: number; left: number; width: number };

type Props = {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  /** Drag-and-drop reorder: put `draggedId` before/after `targetId`. */
  onReorder: (draggedId: string, targetId: string, pos: "before" | "after") => void;
  /** Add a chosen block type into a section column (inline "+ Add block"). */
  onAddToColumn?: (sectionId: string, colIndex: number, type: BlockType) => void;
  /** Add a new section layout above/below an existing top-level block. */
  onAddSection?: (preset: SectionPreset, relativeToId: string, pos: "before" | "after") => void;
  /** Drop a new block (dragged from the palette) before/after a target block. */
  onInsertNew?: (type: BlockType, targetId: string, pos: "before" | "after") => void;
  /** Drop a new block on empty canvas — appended at the end. */
  onAppendNew?: (type: BlockType) => void;
};

type AddMenu = { sectionId: string; colIndex: number; top: number; left: number };
type SectionMenu = { targetId: string; top: number; left: number; pos: "before" | "after" };

function cssEscape(s: string): string {
  return typeof window !== "undefined" && window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, '\\"');
}

export default function EmailCanvas({ blocks, selectedId, onSelect, onMove, onDelete, onReorder, onAddToColumn, onInsertNew, onAppendNew }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [addMenu, setAddMenu] = useState<AddMenu | null>(null);
  // Latest selection, readable from the iframe load handler without stale closures.
  const selRef = useRef(selectedId);
  useEffect(() => {
    selRef.current = selectedId;
  }, [selectedId]);
  // Latest callbacks, so the iframe's drag handlers never go stale.
  const reorderRef = useRef(onReorder);
  const insertNewRef = useRef(onInsertNew);
  const appendNewRef = useRef(onAppendNew);
  const addColRef = useRef(onAddToColumn);
  useEffect(() => {
    reorderRef.current = onReorder;
    insertNewRef.current = onInsertNew;
    appendNewRef.current = onAppendNew;
    addColRef.current = onAddToColumn;
  }, [onReorder, onInsertNew, onAppendNew, onAddToColumn]);

  const render = useCallback(
    (bs: EmailBlock[]) =>
      renderBlocksToEmailHtml(bs, { editable: true, pageBackground: "#f3f4f6" }).replace(
        "</head>",
        `<style>${EDIT_CSS}</style></head>`,
      ),
    [],
  );

  // srcDoc is debounced so rapid property edits don't thrash the iframe reload.
  const [html, setHtml] = useState(() => render(blocks));
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const t = setTimeout(() => setHtml(render(blocks)), 160);
    return () => clearTimeout(t);
  }, [blocks, render]);

  const sizeToContent = useCallback(() => {
    const f = iframeRef.current;
    const d = f?.contentDocument;
    if (f && d?.documentElement) f.style.height = `${d.documentElement.scrollHeight}px`;
  }, []);

  const applySelection = useCallback((doc: Document) => {
    doc.querySelectorAll("[data-block-id].__sel").forEach((el) => el.classList.remove("__sel"));
    const id = selRef.current;
    if (!id) {
      setRect(null);
      return;
    }
    const el = doc.querySelector(`[data-block-id="${cssEscape(id)}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    el.classList.add("__sel");
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width });
  }, []);

  // Wire the iframe each time its document (re)loads.
  useEffect(() => {
    const f = iframeRef.current;
    if (!f) return;

    let draggingId: string | null = null;
    // Where the pointer went down, so a click that actually dragged (moved more
    // than a few px, e.g. released on a block edge) doesn't select by accident.
    let downX = 0;
    let downY = 0;
    function onMouseDown(e: MouseEvent) {
      downX = e.clientX;
      downY = e.clientY;
    }

    const blockElFrom = (t: EventTarget | null): HTMLElement | null =>
      (t as HTMLElement | null)?.closest("[data-block-id]") ?? null;

    function clearDropMarks(d: Document) {
      d.querySelectorAll(".__drop-before,.__drop-after,.__drop-col").forEach((el) => {
        el.classList.remove("__drop-before", "__drop-after", "__drop-col");
      });
    }

    const addColFrom = (t: EventTarget | null): HTMLElement | null =>
      (t as HTMLElement | null)?.closest("[data-add-col]") ?? null;

    // A palette drag exposes our custom MIME (readable during dragover; the
    // value itself only becomes readable on drop).
    const isPaletteDrag = (e: DragEvent): boolean =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(NEW_BLOCK_MIME);

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("a")) e.preventDefault(); // don't navigate while editing
      // Ignore clicks that actually dragged — prevents an accidental
      // select/deselect when the pointer moved between down and up.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      // Inline "+ Add block" — open a type picker at the button, don't select.
      const addEl = t?.closest("[data-add-col]") as HTMLElement | null;
      if (addEl) {
        const [sectionId, ci] = (addEl.getAttribute("data-add-col") ?? "").split(":");
        if (sectionId) {
          const r = addEl.getBoundingClientRect();
          setAddMenu({ sectionId, colIndex: Number(ci) || 0, top: r.bottom + 2, left: r.left });
        }
        return;
      }
      setAddMenu(null);
      const el = t?.closest("[data-block-id]") as HTMLElement | null;
      onSelect(el?.getAttribute("data-block-id") ?? null);
    }

    function onDragStart(e: DragEvent) {
      const el = blockElFrom(e.target);
      draggingId = el?.getAttribute("data-block-id") ?? null;
      if (!draggingId || !e.dataTransfer) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggingId);
      el?.classList.add("__dragging");
    }

    function onDragOver(e: DragEvent) {
      const d = f?.contentDocument;
      if (!d) return;
      const palette = isPaletteDrag(e);
      if (!draggingId && !palette) return;
      e.preventDefault(); // allow the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = palette ? "copy" : "move";
      clearDropMarks(d);

      const el = blockElFrom(e.target);
      const id = el?.getAttribute("data-block-id");
      if (el && id && id !== draggingId) {
        const r = el.getBoundingClientRect();
        el.classList.add(e.clientY < r.top + r.height / 2 ? "__drop-before" : "__drop-after");
        return;
      }
      // Palette drops can also land on an empty column's "+ Add block" strip.
      if (palette) {
        const addEl = addColFrom(e.target);
        if (addEl) addEl.classList.add("__drop-col");
      }
    }

    function onDrop(e: DragEvent) {
      const d = f?.contentDocument;
      if (!d) return;
      const palette = isPaletteDrag(e);
      if (!draggingId && !palette) return;
      e.preventDefault();

      const el = blockElFrom(e.target);
      const targetId = el?.getAttribute("data-block-id") ?? null;

      if (palette) {
        const type = (e.dataTransfer?.getData(NEW_BLOCK_MIME) || "") as BlockType;
        if (type) {
          if (el && targetId) {
            const r = el.getBoundingClientRect();
            const pos = e.clientY < r.top + r.height / 2 ? "before" : "after";
            insertNewRef.current?.(type, targetId, pos);
          } else {
            const addEl = addColFrom(e.target);
            if (addEl) {
              const [sectionId, ci] = (addEl.getAttribute("data-add-col") ?? "").split(":");
              if (sectionId) addColRef.current?.(sectionId, Number(ci) || 0, type);
            } else {
              appendNewRef.current?.(type); // empty canvas → append
            }
          }
        }
      } else if (draggingId && el && targetId && targetId !== draggingId) {
        const r = el.getBoundingClientRect();
        const pos = e.clientY < r.top + r.height / 2 ? "before" : "after";
        reorderRef.current(draggingId, targetId, pos);
      }

      clearDropMarks(d);
      draggingId = null;
    }

    function onDragEnd() {
      const d = f?.contentDocument;
      if (!d) return;
      d.querySelectorAll(".__dragging").forEach((el) => el.classList.remove("__dragging"));
      clearDropMarks(d);
      draggingId = null;
    }

    function attach() {
      const d = f?.contentDocument;
      if (!d?.body) return;
      d.querySelectorAll("[data-block-id]").forEach((el) => el.setAttribute("draggable", "true"));
      d.body.addEventListener("mousedown", onMouseDown);
      d.body.addEventListener("click", onClick);
      d.body.addEventListener("dragstart", onDragStart);
      d.body.addEventListener("dragover", onDragOver);
      d.body.addEventListener("drop", onDrop);
      d.body.addEventListener("dragend", onDragEnd);
      sizeToContent();
      requestAnimationFrame(() => {
        if (f?.contentDocument) applySelection(f.contentDocument);
      });
    }
    f.addEventListener("load", attach);
    if (f.contentDocument?.readyState === "complete") attach();
    return () => {
      f.removeEventListener("load", attach);
      const b = f.contentDocument?.body;
      b?.removeEventListener("mousedown", onMouseDown);
      b?.removeEventListener("click", onClick);
      b?.removeEventListener("dragstart", onDragStart);
      b?.removeEventListener("dragover", onDragOver);
      b?.removeEventListener("drop", onDrop);
      b?.removeEventListener("dragend", onDragEnd);
    };
  }, [html, onSelect, sizeToContent, applySelection]);

  // Re-highlight when the selection changes without reloading the frame.
  useEffect(() => {
    const d = iframeRef.current?.contentDocument;
    if (!d?.body) return;
    const raf = requestAnimationFrame(() => applySelection(d));
    return () => cancelAnimationFrame(raf);
  }, [selectedId, applySelection]);

  const toolbar = useMemo(() => {
    if (!rect || !selectedId) return null;
    return (
      <div
        className="absolute z-10 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 p-0.5 shadow-md backdrop-blur-sm"
        style={{ top: Math.max(2, rect.top + 2), left: Math.max(2, rect.left + rect.width - 86) }}
      >
        <button onClick={() => onMove(selectedId, -1)} title="Move up" className="rounded p-1 text-gray-500 hover:bg-gray-100">
          <ArrowUp size={13} />
        </button>
        <button onClick={() => onMove(selectedId, 1)} title="Move down" className="rounded p-1 text-gray-500 hover:bg-gray-100">
          <ArrowDown size={13} />
        </button>
        <button onClick={() => onDelete(selectedId)} title="Delete" className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500">
          <Trash2 size={13} />
        </button>
      </div>
    );
  }, [rect, selectedId, onMove, onDelete]);

  return (
    <div className="relative mx-auto w-full max-w-[660px]">
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="Email canvas"
        className="block w-full border-0 bg-white"
        style={{ minHeight: 400 }}
      />
      {toolbar}
      {addMenu && onAddToColumn && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAddMenu(null)} />
          <div
            className="absolute z-20 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            style={{ top: addMenu.top, left: addMenu.left }}
          >
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">Add block</div>
            {ADD_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => {
                  onAddToColumn(addMenu.sectionId, addMenu.colIndex, type);
                  setAddMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
