"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { uploadInventorySnapshot } from "./actions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isValidInventoryFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "csv" || ext === "xls" || ext === "xlsx";
}

export default function InventoryUploadModal() {
  const [open, setOpen] = useState(false);

  const [warehouse, setWarehouse] = useState("");
  const [pulledDate, setPulledDate] = useState(todayISO());
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setWarehouse("");
    setPulledDate(todayISO());
    setFile(null);
    setError(null);
    setLoading(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleUpload() {
    if (!file || !warehouse || !pulledDate) return;

    setLoading(true);
    setError(null);

    try {
      await uploadInventorySnapshot(file, { warehouse, pulledDate });
      close();
    } catch {
      setError("Upload failed. Please check the file and try again.");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Trigger */}
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={close}
          />

          <div
            className="
              relative z-10 w-full max-w-md
              rounded-3xl bg-white p-6 space-y-6
              shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]
            "
          >
            <button
              onClick={close}
              className="
                absolute top-4 right-4
                p-1 rounded-full
                text-gray-400 hover:text-gray-700
                hover:bg-gray-100 transition
              "
            >
              <X size={18} />
            </button>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">
                Update Inventory
              </h2>
              <p className="text-sm text-gray-500">
                Upload an inventory snapshot for a specific warehouse and date.
              </p>
            </div>

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
                <option>Minneapolis</option>
                <option>Van Fleet</option>
                <option>St. Paul</option>
              </select>
            </div>

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

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Inventory file
              </label>

              <input
                id="inventory-upload"
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) return;

                  if (!isValidInventoryFile(f)) {
                    setError("Only CSV or Excel files are supported.");
                    return;
                  }

                  setError(null);
                  setFile(f);
                }}
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
                <span className="text-xs font-medium text-orange-500">
                  Browse
                </span>
              </label>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={close}
                className="
                  px-4 py-2 rounded-xl text-sm
                  text-gray-600 hover:text-gray-800
                  hover:bg-gray-100 transition
                "
              >
                Cancel
              </button>

              <button
                disabled={!file || !warehouse || !pulledDate || loading}
                onClick={handleUpload}
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
      )}
    </>
  );
}
