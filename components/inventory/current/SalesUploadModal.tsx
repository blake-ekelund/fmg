"use client";

import { useEffect, useState } from "react";
import { X, UploadCloud, CheckCircle2 } from "lucide-react";
import { uploadSalesData } from "../actions";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type Step =
  | "idle"
  | "uploading-orders"
  | "uploading-items"
  | "processing"
  | "finalizing"
  | "complete"
  | "error";

export default function SalesUploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
}) {
  const router = useRouter();

  const [pulledDate, setPulledDate] = useState(todayISO());
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");

  useEffect(() => {
    if (!open) return;
    setPulledDate(todayISO());
    setOrdersFile(null);
    setItemsFile(null);
    setLoading(false);
    setError(null);
    setStep("idle");
  }, [open]);

  async function upload() {
    if (!ordersFile || !itemsFile || loading) return;

    setLoading(true);
    setError(null);

    try {
      const uploadId = crypto.randomUUID();
      const ordersPath = `orders/${uploadId}_${ordersFile.name}`;
      const itemsPath = `items/${uploadId}_${itemsFile.name}`;

      setStep("uploading-orders");

      const { error: ordersUploadError } = await supabase.storage
        .from("sales-uploads")
        .upload(ordersPath, ordersFile);

      if (ordersUploadError) throw ordersUploadError;

      setStep("uploading-items");

      const { error: itemsUploadError } = await supabase.storage
        .from("sales-uploads")
        .upload(itemsPath, itemsFile);

      if (itemsUploadError) {
        await supabase.storage.from("sales-uploads").remove([ordersPath]);
        throw itemsUploadError;
      }

      setStep("processing");

      await uploadSalesData({
        ordersPath,
        itemsPath,
        pulledDate,
      });

      setStep("finalizing");

      await supabase.storage
        .from("sales-uploads")
        .remove([ordersPath, itemsPath]);

      setStep("complete");
      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStep("error");
      setLoading(false);
    }
  }

  if (!open) return null;

  const checklistSteps = [
    { key: "uploading-orders", label: "Uploading Sales Orders file" },
    { key: "uploading-items", label: "Uploading Sales Items file" },
    { key: "processing", label: "Processing & ingesting data" },
    { key: "finalizing", label: "Finalizing upload" },
  ];

  const currentIndex = checklistSteps.findIndex((s) => s.key === step);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          onClick={loading ? undefined : onClose}
        />

        <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 space-y-6 shadow-xl">

          {/* Close */}
          {step !== "complete" && (
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition disabled:opacity-40"
            >
              <X size={18} />
            </button>
          )}

          {/* Header */}
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-gray-900">
              Upload Sales Data
            </h2>
            <p className="text-sm text-gray-500">
              Upload both Sales Orders and Sales Items files together.
            </p>
          </div>

          {/* SUCCESS STATE */}
          {step === "complete" && (
            <div className="flex flex-col items-center text-center space-y-4 py-6">
              <CheckCircle2 size={56} className="text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Upload Complete
              </h3>
              <p className="text-sm text-gray-500">
                Your sales data has been successfully processed and is now live.
              </p>

              <button
                onClick={() => {
                  onUploaded?.();
                  onClose();
                  router.refresh(); // SPA refresh
                }}
                className="mt-4 px-6 py-2 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition"
              >
                OK
              </button>
            </div>
          )}

          {/* INPUT STATE */}
          {!loading && step !== "complete" && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Date data was pulled
                </label>
                <input
                  type="date"
                  value={pulledDate}
                  onChange={(e) => setPulledDate(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm bg-gray-50 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-orange-400/40"
                />
              </div>

              <FileUploadBlock
                id="orders-upload"
                label="Sales Orders File (.xls)"
                file={ordersFile}
                setFile={setOrdersFile}
              />

              <FileUploadBlock
                id="items-upload"
                label="Sales Items File (.csv)"
                file={itemsFile}
                setFile={setItemsFile}
              />
            </>
          )}

          {/* PROCESSING STATE */}
          {loading && (
            <div className="space-y-4 pt-2">
              {checklistSteps.map((s, index) => {
                const isActive = index === currentIndex;
                const isComplete = index < currentIndex;

                return (
                  <div key={s.key} className="flex items-center gap-3 text-sm">
                    {isComplete ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                      <div
                        className={`h-3 w-3 rounded-full ${
                          isActive
                            ? "bg-orange-400 pulse-dot"
                            : "bg-gray-300"
                        }`}
                      />
                    )}

                    <span
                      className={
                        isActive
                          ? "font-medium text-gray-900"
                          : "text-gray-500"
                      }
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}

              {step === "processing" && (
                <div className="h-1 w-full bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-orange-400 progress-bar" />
                </div>
              )}
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          {!loading && step === "idle" && (
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                disabled={!ordersFile || !itemsFile}
                onClick={upload}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-400 text-white hover:bg-orange-500 disabled:opacity-40"
              >
                Upload Sales Data
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .pulse-dot {
          animation: pulse 1.5s infinite;
        }

        .progress-bar {
          animation: slide 2s linear infinite;
        }

        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }

        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </>
  );
}

function FileUploadBlock({
  id,
  label,
  file,
  setFile,
}: {
  id: string;
  label: string;
  file: File | null;
  setFile: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        id={id}
        type="file"
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className="flex items-center justify-between w-full rounded-xl px-3 py-2 text-sm bg-gray-50 cursor-pointer ring-1 ring-inset ring-gray-200 hover:bg-gray-100"
      >
        <span className="truncate text-gray-600">
          {file ? file.name : "Select file"}
        </span>
        <UploadCloud size={18} className="text-gray-400" />
      </label>
    </div>
  );
}