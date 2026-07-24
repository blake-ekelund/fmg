"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  ShoppingCart,
  ChevronDown,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useIsMobile } from "@/lib/useIsMobile";

import InventoryUploadModal from "@/components/inventory/current/InventoryUploadModal";
import SalesUploadModal from "@/components/inventory/current/SalesUploadModal";
import FishbowlCard, {
  type FishbowlStatus,
  type Feed,
  type SyncMessage,
} from "./FishbowlCard";
import SlackCard from "./SlackCard";

type UploadType = "inventory" | "sales";

async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function IntegrationsPage() {
  // Fishbowl integration status (hero card)
  const [status, setStatus] = useState<FishbowlStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<SyncMessage | null>(null);

  // Manual upload (fallback for sources without an integration yet)
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isMobile = useIsMobile();
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [pickerOpen]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/fishbowl", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) {
        setStatusError(json?.error ?? `Failed (${res.status})`);
        return;
      }
      setStatus(json as FishbowlStatus);
      setStatusError(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const runSync = useCallback(
    async (feed: Feed) => {
      setSyncingKey(feed.key);
      setSyncMessage(null);
      try {
        // ?now=1 runs off-schedule but keeps the shrink guard (only ?force drops it).
        const res = await fetch(`${feed.syncPath}?now=1`, { headers: await authHeader() });
        const json = await res.json();
        if (!res.ok) {
          setSyncMessage({ key: feed.key, kind: "error", text: json?.error ?? `Sync failed (${res.status})` });
        } else if (json.synced) {
          const text =
            feed.key === "sales"
              ? `Synced ${Number(json.orders).toLocaleString()} orders and ${Number(json.items).toLocaleString()} line items.`
              : `Synced ${Number(json.parts).toLocaleString()} inventory parts.`;
          setSyncMessage({ key: feed.key, kind: "ok", text });
        } else if (json.skipped) {
          setSyncMessage({ key: feed.key, kind: "error", text: json.reason ?? "Sync skipped." });
        } else {
          setSyncMessage({ key: feed.key, kind: "ok", text: "Sync complete." });
        }
      } catch (e) {
        setSyncMessage({ key: feed.key, kind: "error", text: e instanceof Error ? e.message : String(e) });
      } finally {
        setSyncingKey(null);
        fetchStatus(); // refresh the card regardless of outcome
      }
    },
    [fetchStatus],
  );

  function pickType(t: UploadType) {
    setPickerOpen(false);
    if (t === "inventory") setShowInventoryModal(true);
    else setShowSalesModal(true);
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1200px] mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">
            The systems that feed data into the portal — and when they last did.
          </p>
        </div>

        {/* Manual upload (fallback). Desktop only — both options mean picking a
            spreadsheet off a machine that has one, so on a phone the whole
            control is gone rather than an empty menu. */}
        <div className={clsx("relative", isMobile && "hidden")} ref={pickerRef}>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white text-gray-700 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            <Upload size={14} />
            Upload data
            <ChevronDown size={12} className="opacity-70" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
              <button
                onClick={() => pickType("inventory")}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
              >
                <div className="h-7 w-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">Inventory snapshot</div>
                  <div className="text-[11px] text-gray-500">Manual fallback for Point B availability</div>
                </div>
              </button>
              <button
                onClick={() => pickType("sales")}
                className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 text-left border-t border-gray-100"
              >
                <div className="h-7 w-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <ShoppingCart size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">Sales orders + items</div>
                  <div className="text-[11px] text-gray-500">Manual fallback if Fishbowl is down</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fishbowl integration */}
      {status ? (
        <FishbowlCard
          status={status}
          syncingKey={syncingKey}
          onSync={runSync}
          syncMessage={syncMessage}
        />
      ) : statusError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700">
          Couldn’t load Fishbowl status: {statusError}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400 inline-flex items-center gap-2 justify-center w-full">
          <Loader2 size={14} className="animate-spin" />
          Loading integration…
        </div>
      )}

      {/* Slack assistant */}
      <SlackCard />

      <InventoryUploadModal open={showInventoryModal} onClose={() => setShowInventoryModal(false)} />
      <SalesUploadModal open={showSalesModal} onClose={() => setShowSalesModal(false)} />
    </div>
  );
}
