"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Link,
  RemoveFormatting,
  Quote,
} from "lucide-react";
import clsx from "clsx";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

type ToolbarBtn = {
  icon: React.ReactNode;
  command: string;
  arg?: string;
  label: string;
  active?: string; // queryCommandState/queryCommandValue check
};

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0); // trigger re-render for active states
  const isInitialMount = useRef(true);
  const lastValueRef = useRef(value);

  // Set initial content
  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value;
      isInitialMount.current = false;
      lastValueRef.current = value;
    }
  }, [value]);

  // If value changes externally (e.g. switching posts), update editor
  useEffect(() => {
    if (!isInitialMount.current && editorRef.current && value !== lastValueRef.current) {
      editorRef.current.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastValueRef.current = html;
      onChange(html);
    }
  }, [onChange]);

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    forceUpdate((n) => n + 1);
  }

  function isActive(command: string): boolean {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Update toolbar active states on key events
    setTimeout(() => forceUpdate((n) => n + 1), 0);
  }

  function handleLink() {
    const url = prompt("Enter URL:");
    if (url) exec("createLink", url);
  }

  function insertHeading(tag: "H2" | "H3") {
    exec("formatBlock", tag);
  }

  const toolbar: (ToolbarBtn | "sep")[] = [
    { icon: <Undo2 size={14} />, command: "undo", label: "Undo" },
    { icon: <Redo2 size={14} />, command: "redo", label: "Redo" },
    "sep",
    { icon: <Heading2 size={14} />, command: "heading2", label: "Heading 2" },
    { icon: <Heading3 size={14} />, command: "heading3", label: "Heading 3" },
    "sep",
    { icon: <Bold size={14} />, command: "bold", label: "Bold" },
    { icon: <Italic size={14} />, command: "italic", label: "Italic" },
    "sep",
    { icon: <List size={14} />, command: "insertUnorderedList", label: "Bullet list" },
    { icon: <ListOrdered size={14} />, command: "insertOrderedList", label: "Numbered list" },
    { icon: <Quote size={14} />, command: "formatBlock", arg: "BLOCKQUOTE", label: "Quote" },
    "sep",
    { icon: <Link size={14} />, command: "link", label: "Insert link" },
    { icon: <RemoveFormatting size={14} />, command: "removeFormat", label: "Clear formatting" },
  ];

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:border-gray-300 transition">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        {toolbar.map((item, i) => {
          if (item === "sep") {
            return <div key={`sep-${i}`} className="w-px h-5 bg-gray-200 mx-1" />;
          }

          const active =
            item.command === "bold" ? isActive("bold") :
            item.command === "italic" ? isActive("italic") :
            item.command === "insertUnorderedList" ? isActive("insertUnorderedList") :
            item.command === "insertOrderedList" ? isActive("insertOrderedList") :
            false;

          return (
            <button
              key={item.command + (item.arg ?? "")}
              type="button"
              title={item.label}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent losing selection
                if (item.command === "heading2") insertHeading("H2");
                else if (item.command === "heading3") insertHeading("H3");
                else if (item.command === "link") handleLink();
                else if (item.arg) exec(item.command, item.arg);
                else exec(item.command);
              }}
              className={clsx(
                "p-1.5 rounded transition",
                active
                  ? "bg-gray-200 text-gray-900"
                  : "text-gray-500 hover:bg-gray-200/60 hover:text-gray-700"
              )}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={() => forceUpdate((n) => n + 1)}
        data-placeholder={placeholder ?? "Start writing…"}
        className={clsx(
          "min-h-[400px] max-h-[60vh] overflow-y-auto px-6 py-5 outline-none",
          "text-[15px] text-gray-800 leading-relaxed",
          // Prose-like styling for the editable content
          "[&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>h2]:mt-7 [&>h2]:mb-3",
          "[&>h3]:text-lg [&>h3]:font-semibold [&>h3]:text-gray-900 [&>h3]:mt-5 [&>h3]:mb-2",
          "[&>p]:mb-4 [&>p]:leading-relaxed",
          "[&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul>li]:mb-1",
          "[&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>ol>li]:mb-1",
          "[&>blockquote]:border-l-4 [&>blockquote]:border-gray-300 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-gray-600 [&>blockquote]:my-4",
          "[&_a]:text-blue-600 [&_a]:underline",
          "[&_strong]:font-semibold [&_strong]:text-gray-900",
          "[&_em]:italic",
          // Placeholder
          "empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 empty:before:pointer-events-none"
        )}
      />
    </div>
  );
}
