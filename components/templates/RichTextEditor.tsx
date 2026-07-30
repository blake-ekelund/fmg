"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Link2, List, ListOrdered, Heading2, Braces } from "lucide-react";
import { sanitizeInlineHtml } from "@/lib/email/renderBlocks";
import { mergeGroupsFor, type Audience } from "@/lib/email/mergeFields";

/**
 * A small WYSIWYG editor for text blocks — the "custom text" control. Edits
 * rich content directly (bold/italic/underline/headings/lists/links) plus a
 * merge-field inserter. Output is run through the same email sanitizer the send
 * uses, so only email-safe tags survive. Paragraph alignment stays a block-level
 * control (the sanitizer strips per-element alignment).
 */

type Props = {
  value: string;
  onChange: (html: string) => void;
  channel: Audience | "both";
};

export default function RichTextEditor({ value, onChange, channel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Sync an external value in without clobbering the cursor while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (el) onChange(sanitizeInlineHtml(el.innerHTML));
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    // Semantic tags (<b>/<i>) instead of styled spans, so they survive the
    // email sanitizer's allowlist.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd, false, arg);
    emit();
  }

  function insertMerge(key: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, `{{${key}}}`);
    setMergeOpen(false);
    emit();
  }

  function link() {
    const url = window.prompt("Link URL", "https://");
    if (url) exec("createLink", url);
  }

  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 p-1">
        <Btn onClick={() => exec("bold")} title="Bold"><Bold size={13} /></Btn>
        <Btn onClick={() => exec("italic")} title="Italic"><Italic size={13} /></Btn>
        <Btn onClick={() => exec("underline")} title="Underline"><Underline size={13} /></Btn>
        <Btn onClick={() => exec("formatBlock", "H2")} title="Heading"><Heading2 size={13} /></Btn>
        <Btn onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List size={13} /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered size={13} /></Btn>
        <Btn onClick={link} title="Insert link"><Link2 size={13} /></Btn>
        <span className="mx-0.5 h-4 w-px bg-gray-200" />
        <div className="relative">
          <Btn onClick={() => setMergeOpen((v) => !v)} title="Insert merge field"><Braces size={13} /></Btn>
          {mergeOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {mergeGroupsFor(channel).map((g) => (
                <div key={g.group}>
                  <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{g.group}</div>
                  {g.fields.map((f) => (
                    <button
                      key={f.key}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertMerge(f.key)}
                      className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-blue-50"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        className="min-h-[120px] px-3 py-2 text-sm leading-relaxed focus:outline-none [&_a]:text-blue-600 [&_a]:underline [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

function Btn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
    >
      {children}
    </button>
  );
}
