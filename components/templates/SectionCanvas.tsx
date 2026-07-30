"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Type, Image as ImageIcon, MousePointerClick, Minus, Rows3, Share2, ShoppingBag, PanelTop } from "lucide-react";
import type { SectionBlock, BlockType } from "./types";
import { SECTION_CONTENT_TYPES } from "./types";
import BlockRenderer from "./BlockRenderer";

const CONTENT_META: Record<string, { label: string; icon: typeof Type }> = {
  image: { label: "Image", icon: ImageIcon },
  text: { label: "Text", icon: Type },
  button: { label: "Button", icon: MousePointerClick },
  header: { label: "Heading", icon: PanelTop },
  divider: { label: "Divider", icon: Minus },
  spacer: { label: "Spacer", icon: Rows3 },
  social: { label: "Social", icon: Share2 },
  product: { label: "Product", icon: ShoppingBag },
  caption: { label: "Caption", icon: ImageIcon },
};

type Props = {
  section: SectionBlock;
  selectedId: string | null;
  onSelectSection: () => void;
  onSelectBlock: (id: string) => void;
  onAddToColumn: (colIndex: number, type: BlockType) => void;
  onMoveInColumn: (colIndex: number, blockId: string, dir: -1 | 1) => void;
  onRemoveBlock: (id: string) => void;
};

export default function SectionCanvas({
  section,
  selectedId,
  onSelectSection,
  onSelectBlock,
  onAddToColumn,
  onMoveInColumn,
  onRemoveBlock,
}: Props) {
  const [addMenuCol, setAddMenuCol] = useState<number | null>(null);

  const alignItems =
    section.verticalAlign === "middle" ? "center" : section.verticalAlign === "bottom" ? "flex-end" : "flex-start";

  const sectionSelected = selectedId === section.id;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelectSection(); }}
      className={`relative cursor-pointer transition-all rounded ${sectionSelected ? "ring-2 ring-blue-500" : "ring-1 ring-transparent hover:ring-gray-300"}`}
      style={{
        padding: section.padding,
        backgroundColor: section.bgColor || undefined,
        backgroundImage: section.bgImage ? `url('${section.bgImage}')` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex" style={{ gap: section.gap, alignItems }}>
        {section.columns.map((col, ci) => (
          <div
            key={col.id}
            className="min-w-0"
            style={{ flex: `${col.weight} 1 0%`, backgroundColor: col.bgColor || undefined, padding: col.padding }}
          >
            {col.blocks.length === 0 && (
              <div className="rounded border border-dashed border-gray-300 bg-white/60 py-6 text-center text-[11px] text-gray-400">
                Empty column
              </div>
            )}

            {col.blocks.map((b, bi) => (
              <div key={b.id} className="relative group/inner" onClick={(e) => { e.stopPropagation(); onSelectBlock(b.id); }}>
                <BlockRenderer block={b} selected={selectedId === b.id} onSelect={() => onSelectBlock(b.id)} />
                {/* Per-block hover controls */}
                <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover/inner:opacity-100 transition-opacity bg-white/90 rounded shadow-sm border border-gray-200 p-0.5 z-10">
                  <button onClick={(e) => { e.stopPropagation(); onMoveInColumn(ci, b.id, -1); }} disabled={bi === 0} className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"><ArrowUp size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); onMoveInColumn(ci, b.id, 1); }} disabled={bi === col.blocks.length - 1} className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20"><ArrowDown size={11} /></button>
                  <button onClick={(e) => { e.stopPropagation(); onRemoveBlock(b.id); }} className="p-0.5 rounded text-gray-400 hover:text-rose-500"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}

            {/* Add block into this column */}
            <div className="relative mt-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setAddMenuCol(addMenuCol === ci ? null : ci); }}
                className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 bg-white/70 py-1.5 text-[11px] font-medium text-gray-500 hover:border-blue-300 hover:text-blue-600 transition"
              >
                <Plus size={12} /> Add
              </button>
              {addMenuCol === ci && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                  {SECTION_CONTENT_TYPES.map((t) => {
                    const meta = CONTENT_META[t];
                    if (!meta) return null;
                    return (
                      <button
                        key={t}
                        onClick={() => { onAddToColumn(ci, t); setAddMenuCol(null); }}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition"
                      >
                        <meta.icon size={13} /> {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
