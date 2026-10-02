"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { plainTextToRichText, richTextToPlain, sanitizeRichText } from "@/lib/richText";

type Cmd = "bold" | "italic" | "insertUnorderedList" | "insertOrderedList";

const TOOLS: { cmd: Cmd; label: string; Icon: typeof Bold }[] = [
  { cmd: "bold", label: "Bold", Icon: Bold },
  { cmd: "italic", label: "Italic", Icon: Italic },
  { cmd: "insertUnorderedList", label: "Bulleted list", Icon: List },
  { cmd: "insertOrderedList", label: "Numbered list", Icon: ListOrdered },
];

/**
 * Product-copy editor: bold, italic, bulleted and numbered lists — nothing
 * else (see lib/richText.ts for the stored HTML subset). Emits sanitized
 * HTML on every edit; legacy plain-text values open converted ("•" lines
 * become a list) but are only rewritten once someone edits them. Paste is
 * plain text so formatting from Word / websites can't sneak in.
 */
export default function RichTextField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
  softMax,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  /** Live counter (of the visible text) that turns amber past this length. */
  softMax?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<Cmd, boolean>>({
    bold: false,
    italic: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  });

  // Load external values (first render, discard, another product) without
  // clobbering the caret while the user types.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = plainTextToRichText(value);
    lastEmitted.current = value;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichText(el.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }

  function refreshActive() {
    if (!ref.current?.contains(document.getSelection()?.anchorNode ?? null)) return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
    });
  }

  function run(cmd: Cmd) {
    ref.current?.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand(cmd);
    emit();
    refreshActive();
  }

  const plain = richTextToPlain(value);
  const over = softMax != null && plain.length > softMax;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        {softMax != null ? (
          <span className={clsx("text-[11px] tabular-nums", over ? "font-semibold text-amber-600" : "text-gray-400")}>
            {plain.length}/{softMax}
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white transition focus-within:ring-2 focus-within:ring-gray-300">
        <div className="flex items-center gap-0.5 border-b border-gray-100 bg-gray-50/70 px-1.5 py-1">
          {TOOLS.map(({ cmd, label: name, Icon }) => (
            <button
              key={cmd}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={active[cmd]}
              // mousedown keeps the text selection the command applies to.
              onMouseDown={(e) => {
                e.preventDefault();
                run(cmd);
              }}
              className={clsx(
                "rounded-md p-1.5 transition",
                active[cmd] ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-200 hover:text-gray-900",
              )}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="relative">
          {!plain && placeholder ? (
            <div className="pointer-events-none absolute left-3 top-2 whitespace-pre-line text-sm text-gray-400">
              {placeholder}
            </div>
          ) : null}
          <div
            ref={ref}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            contentEditable
            suppressContentEditableWarning
            onInput={emit}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
            onKeyUp={refreshActive}
            onMouseUp={refreshActive}
            onFocus={refreshActive}
            style={{ minHeight: `${rows * 1.5 + 1}rem` }}
            className="px-3 py-2 text-sm leading-6 text-gray-900 outline-none [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p+ol]:mt-2 [&_p+ul]:mt-2 [&_ul+p]:mt-2 [&_ol+p]:mt-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
          />
        </div>
      </div>
      {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
    </div>
  );
}
