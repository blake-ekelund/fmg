"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, X, FileImage, FileVideo, FileText } from "lucide-react";

type Props = {
  contentType: string;
  setContentType: (v: string) => void;
  strategy: string;
  setStrategy: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
};

export function ContentSection({
  contentType,
  setContentType,
  strategy,
  setStrategy,
  description,
  setDescription,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const accept = useMemo(
    () =>
      [
        "image/*", // images
        "video/*", // videos
        // Allow common doc types too (optional)
        ".pdf",
        ".doc",
        ".docx",
      ].join(","),
    []
  );

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    const incoming = Array.from(list);

    // De-dupe by name+size+lastModified
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
    setFiles((prev) => prev.filter((f) => keyOf(f) !== keyOf(target)));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-6 pt-6">
      {/* Row: Content Type + Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Content Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Content Type
          </label>
          <input
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            placeholder="e.g. Product launch"
            className="
              w-full rounded-xl
              border border-gray-200
              bg-white px-3 py-2.5 text-sm
              placeholder:text-gray-400
              focus:outline-none
              focus:ring-2 focus:ring-black/5
              focus:border-gray-300
              transition
            "
          />
        </div>

        {/* Strategy */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Strategy
          </label>
          <input
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            placeholder="What is this trying to achieve?"
            className="
              w-full rounded-xl
              border border-gray-200
              bg-white px-3 py-2.5 text-sm
              placeholder:text-gray-400
              focus:outline-none
              focus:ring-2 focus:ring-black/5
              focus:border-gray-300
              transition
            "
          />
        </div>
      </div>

      {/* Upload Area */}
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-gray-700">
              Media Upload
            </div>
            <div className="text-xs text-gray-500">
              Drag & drop files here, or click to browse.
            </div>
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

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(false);
          }}
          onDrop={onDrop}
          className={`
            rounded-xl border border-dashed
            ${dragOver ? "border-gray-400 bg-gray-50" : "border-gray-200 bg-gray-50/50"}
            p-6 cursor-pointer
            transition
          `}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <Upload className="w-4 h-4" />
            <span>
              {dragOver ? "Drop files to add" : "Click or drop files here"}
            </span>
          </div>
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </div>

            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={keyOf(f)} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {fileIcon(f)}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {f.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatBytes(f.size)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(f)}
                    className="text-gray-400 hover:text-gray-700 transition"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Post Copy */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Post Copy
        </label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Write the caption, copy, or notes for this content…"
          className="
            w-full rounded-xl
            border border-gray-200
            bg-white px-3 py-2.5 text-sm
            placeholder:text-gray-400
            focus:outline-none
            focus:ring-2 focus:ring-black/5
            focus:border-gray-300
            transition
            resize-none
          "
        />
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function keyOf(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function fileIcon(f: File) {
  if (f.type.startsWith("image/")) return <FileImage className="w-4 h-4 text-gray-600" />;
  if (f.type.startsWith("video/")) return <FileVideo className="w-4 h-4 text-gray-600" />;
  return <FileText className="w-4 h-4 text-gray-600" />;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}
