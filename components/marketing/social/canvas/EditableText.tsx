"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { TextLayer } from "@/lib/social/canvas";

/** In-place text editing (browser only). Uncontrolled so the caret never jumps. */
export default function EditableText({
  layer,
  style,
  onChange,
  onDone,
}: {
  layer: TextLayer;
  style: CSSProperties;
  onChange: (t: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = layer.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only on entering edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.id]);
  return (
    <div
      ref={ref}
      data-layer-id={layer.id}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange((e.target as HTMLDivElement).innerText.replace(/\n$/, ""))}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") (e.target as HTMLDivElement).blur();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ...style, outline: "none", cursor: "text", display: "block", minHeight: layer.size * layer.lineHeight }}
    />
  );
}
