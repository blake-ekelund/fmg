"use client";

import { useState, useEffect } from "react";
import { X, UploadCloud } from "lucide-react";
import { uploadInventorySnapshot } from "../actions";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InventoryUploadModal() {
  const [open, setOpen] = useState(false);
  const [warehouse, setWarehouse] = useState("");
  const [pulledDate, setPulledDate] = useState(todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file || !warehouse) return;
    setLoading(true);
    setError(null);

    try {
      await uploadInventorySnapshot(file, {
        warehouse,
        pulledDate,
      });
      window.location.reload();
    } catch {
      setError("Upload failed. Please check the file and try again.");
      setLoading(false);
    }
  }

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="
          px-4 py-2 rounded-xl text-sm font-medium
          bg-orange-400 text-white
          hover:bg-orange-500 transition
        "
      >
        Update Inventory
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div
        className="
          relative z-10 w-full max-w-md
          rounded-3xl bg-white p-6 space-y-6
          shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]
        "
      >
        {/* Close */}
        <button
          onClick={() => setOpen(false)}
          className="
            absolute top-4 right-4
            p-1 rounded-full
            text-gray-400 hover:text-gray-700
            hover:bg-gray-100 transition
          "
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">
            Update Inventory
          </h2>
          <p className="text-sm text-gray-500">
            Upload an inventory snapshot for a specific warehouse and date.
          </p>
        </div>

        {/* Warehouse */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Warehouse
          </label>
          <select
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            className="
              w-full rounded-xl px-3 py-2 text-sm
              bg-gray-50
              ring-1 ring-inset ring-gray-200
              focus:bg-white focus:outline-none
              focus:ring-2 focus:ring-orange-400/40
            "
          >
            <option value="">Select warehouse</option>
            <option>Point B</option>
            <option>Other</option>
          </select>
        </div>

        {/* Date */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Date inventory was pulled
          </label>
          <input
            type="date"
            value={pulledDate}
            onChange={(e) => setPulledDate(e.target.value)}
            className="
              w-full rounded-xl px-3 py-2 text-sm
              bg-gray-50
              ring-1 ring-inset ring-gray-200
              focus:bg-white focus:outline-none
              focus:ring-2 focus:ring-orange-400/40
            "
          />
        </div>

        {/* File upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Inventory file
          </label>

          <input
            id="inventory-upload"
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) =>
              setFile(e.target.files?.[0] ?? null)
            }
          />

          <label
            htmlFor="inventory-upload"
            className="
              flex items-center justify-between
              w-full rounded-xl px-3 py-2 text-sm
              bg-gray-50 cursor-pointer
              ring-1 ring-inset ring-gray-200
              hover:bg-gray-100 transition
            "
          >
            <span className="text-gray-600 truncate">
              {file ? file.name : "Select file (.csv, .xls, .xlsx)"}
            </span>
            <UploadCloud
              size={18}
              className="text-gray-400"
            />
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => setOpen(false)}
            className="
              px-4 py-2 rounded-xl text-sm
              text-gray-600 hover:text-gray-800
              hover:bg-gray-100 transition
            "
          >
            Cancel
          </button>

          <button
            disabled={!file || !warehouse || loading}
            onClick={upload}
            className="
              px-4 py-2 rounded-xl text-sm font-medium
              bg-orange-400 text-white
              hover:bg-orange-500
              disabled:opacity-40 transition
            "
          >
            {loading ? "Uploading…" : "Upload file"}
          </button>
        </div>
      </div>
    </div>
  );
}
