// /shopify/components/ShopifyUploadButton.tsx
"use client";

import { useState } from "react";
import { X, Upload } from "lucide-react";

type Props = {
  status: {
    lastDay: string | null;
    nextRequiredDay: string | null;
  } | null;
};

export function ShopifyUploadButton({ status }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function upload() {
    if (!file) return;

    setLoading(true);
    setMsg("Uploading…");

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/marketing/upload", {
      method: "POST",
      body: fd,
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json.error || "Upload failed");
      return;
    }

    setMsg("✅ Uploaded successfully");
    setTimeout(() => location.reload(), 800);
  }

  return (
    <>
      {/* Top-right button */}
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-orange-800 text-white px-4 py-2 text-sm shadow-sm hover:shadow transition focus-visible:ring-2 focus-visible:ring-orange-800/40"
      >
        Upload CSV
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          {/* Modal panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Upload Shopify CSV</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Status */}
            <p className="text-sm text-gray-500 mb-5">
              Last uploaded: <b>{status?.lastDay ?? "—"}</b>
              <br />
              Next required:{" "}
              <b>{status?.nextRequiredDay ?? "First upload"}</b>
            </p>

            {/* File dropzone */}
            <label
              className={[
                "flex flex-col items-center justify-center gap-2",
                "rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition",
                file
                  ? "border-orange-800/50 bg-orange-50"
                  : "border-gray-300 hover:border-gray-400",
              ].join(" ")}
            >
              <Upload
                className={`h-5 w-5 ${
                  file ? "text-orange-800" : "text-gray-400"
                }`}
              />

              {!file ? (
                <>
                  <span className="text-sm font-medium text-gray-800">
                    Click to choose a CSV
                  </span>
                  <span className="text-xs text-gray-500">
                    or drag and drop it here
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-gray-900">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    Click to change file
                  </span>
                </>
              )}

              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />
            </label>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={upload}
                disabled={loading || !file}
                className="rounded-xl bg-orange-800 text-white px-4 py-2 text-sm shadow-sm disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-orange-800/40"
              >
                {loading ? "Uploading…" : "Upload"}
              </button>
            </div>

            {msg && (
              <p className="mt-3 text-sm text-gray-600">{msg}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
