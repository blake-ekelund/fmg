"use client";

import { useMemo, useRef, useState } from "react";
import {
  Upload,
  X,
  FileImage,
  FileVideo,
  FileText,
  CheckCircle,
  Send,
  Rocket,
} from "lucide-react";

import {
  ContentType,
  StrategyType,
  ContentStatus,
} from "../../types";

/* ---------- Options ---------- */

const CONTENT_TYPE_OPTIONS: ContentType[] = [
  "Photo",
  "Carousel",
  "Reel",
  "Live",
  "Blog",
  "Newsletter",
];

const STRATEGY_OPTIONS: StrategyType[] = [
  "Awareness",
  "Engagement",
  "Conversion",
  "Retention",
  "Launch",
  "Education",
];

/* ---------- Props ---------- */

type Props = {
  contentType: ContentType | "";
  setContentType: (v: ContentType | "") => void;

  strategy: StrategyType | "";
  setStrategy: (v: StrategyType | "") => void;

  description: string;
  setDescription: (v: string) => void;

  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;

  status?: ContentStatus;
  onTransition?: (newStatus: ContentStatus) => void;
};

/* ---------- Component ---------- */

export function ContentSection({
  contentType,
  setContentType,
  strategy,
  setStrategy,
  description,
  setDescription,
  files,
  setFiles,
  status,
  onTransition,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = useMemo(
    () => ["image/*", "video/*", ".pdf", ".doc", ".docx"].join(","),
    []
  );

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    const incoming = Array.from(list);

    setFiles((prev) => {
      const seen = new Set(prev.map((f) => keyOf(f)));
      const merged = [...prev];

      for (const f of incoming) {
        const k = keyOf(f);
        if (!seen.has(k)) {
          merged.push(f);
          seen.add(k);
        }
      }

      return merged;
    });
  }

  function removeFile(target: File) {
    setFiles((prev) =>
      prev.filter((f) => keyOf(f) !== keyOf(target))
    );
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  /* ======================================
     Render
  ====================================== */

  return (
    <div className="space-y-8 pt-6">

      {/* ---------- CONTENT TYPE + STRATEGY ---------- */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Content Type
          </label>

          <select
            value={contentType}
            onChange={(e) =>
              setContentType(e.target.value as ContentType | "")
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Select type</option>
            {CONTENT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Strategy
          </label>

          <select
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value as StrategyType | "")
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Select strategy</option>
            {STRATEGY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---------- Upload ---------- */}

      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        className={`rounded-xl border border-dashed p-6 cursor-pointer transition ${
          dragOver
            ? "bg-gray-100 border-gray-400"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
          <Upload size={14} />
          Click or drag files here
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
          {files.map((f) => (
            <li
              key={keyOf(f)}
              className="flex justify-between px-4 py-3"
            >
              <div className="flex gap-2 items-center truncate">
                {fileIcon(f)}
                <span className="truncate text-sm">
                  {f.name}
                </span>
              </div>

              <button
                onClick={() => removeFile(f)}
                className="text-gray-400 hover:text-black"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Description ---------- */}

      <div>
        <label className="text-sm font-medium text-gray-700">
          Post Copy
        </label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function keyOf(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function fileIcon(f: File) {
  if (f.type.startsWith("image/"))
    return <FileImage size={14} />;
  if (f.type.startsWith("video/"))
    return <FileVideo size={14} />;
  return <FileText size={14} />;
}
