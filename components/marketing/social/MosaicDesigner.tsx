"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import MediaLibraryModal from "@/components/templates/MediaLibraryModal";
import type { CanvasSlide } from "@/lib/social/canvas";
import { MOSAIC_BLEED, MOSAIC_VISIBLE_W, type GridRows } from "@/lib/social/gridPlan";
import type { SocialBrand } from "@/lib/social/types";
import CanvasEditor from "./canvas/CanvasEditor";
import { useHistory } from "./canvas/useHistory";
import { uploadSocialImage } from "./api";

/**
 * "Design the picture" — the whole grid picture as one big canvas in the
 * normal canvas editor: change the photo's opacity, add text, shapes, more
 * photos, a background… Lines show where it will be cut into posts. Done
 * hands the canvas back to the planner, which splits it (lib/social/mosaicDesign.ts).
 */
export default function MosaicDesigner({
  brand,
  rows,
  initial,
  onDone,
  onCancel,
}: {
  brand: SocialBrand;
  rows: GridRows;
  initial: CanvasSlide;
  onDone: (slide: CanvasSlide) => void;
  onCancel: () => void;
}) {
  const history = useHistory<CanvasSlide>(initial);
  const [picker, setPicker] = useState<((url: string) => void) | null>(null);

  // Portaled to <body>: the planner's blurred backdrop would otherwise become
  // this full-screen layer's positioning box (and scroll with it).
  return createPortal(
    <div data-stacked-modal className="fixed inset-0 z-[68] flex flex-col bg-gray-100">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Design the picture</h2>
          <p className="text-xs text-gray-500">
            Edit it as one image — it&apos;s cut into {rows * 3} posts along the white lines. Faded edges only show in the feed.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            <X size={15} /> Cancel
          </button>
          <button
            onClick={() => onDone(history.value)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Check size={15} /> Done
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CanvasEditor
          brand={brand}
          slide={history.value}
          index={1}
          total={1}
          locked={false}
          onChange={(next, key) => history.set(next, key)}
          undo={history.undo}
          redo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          // The library picker also has the product photos.
          requestImage={(_source, onPicked) => setPicker(() => onPicked)}
          onAddSlide={() => {}}
          canAddSlide={false}
          hideSlideMenu
          problems={[]}
          maxStageWidth={980}
          stageOverlay={(scale) => <CutLines rows={rows} scale={scale} />}
        />
      </div>

      <MediaLibraryModal
        open={!!picker}
        stacked
        onClose={() => setPicker(null)}
        onSelect={(url) => {
          picker?.(url);
          setPicker(null);
        }}
        inbox="social-uploads"
        uploader={uploadSocialImage}
      />
    </div>,
    document.body,
  );
}

/** Where the picture is cut, and the feed-only bleed strips at the sides. */
function CutLines({ rows, scale }: { rows: GridRows; scale: number }) {
  const px = (v: number) => v * scale;
  return (
    <>
      <span className="absolute inset-y-0 left-0 bg-white/45" style={{ width: px(MOSAIC_BLEED) }} />
      <span className="absolute inset-y-0 right-0 bg-white/45" style={{ width: px(MOSAIC_BLEED) }} />
      {[1, 2].map((k) => (
        <span key={`v${k}`} className="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ left: px(MOSAIC_BLEED + k * MOSAIC_VISIBLE_W) }} />
      ))}
      {Array.from({ length: rows - 1 }, (_, k) => (
        <span key={`h${k}`} className="absolute inset-x-0 h-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ top: px((k + 1) * 1350) }} />
      ))}
    </>
  );
}
