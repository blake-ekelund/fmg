"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, ShoppingCart, CheckCircle, DollarSign, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";

import PageHeader from "@/components/ui/PageHeader";
import InventoryUploadModal from "@/components/inventory/current/InventoryUploadModal";
import SalesUploadModal from "@/components/inventory/current/SalesUploadModal";

type UploadInfo = {
  date: string | null;
  rowCount: number | null;
};

export default function DataPage() {
  const [invInfo, setInvInfo] = useState<UploadInfo>({ date: null, rowCount: null });
  const [salesInfo, setSalesInfo] = useState<UploadInfo>({ date: null, rowCount: null });

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showSalesModal, setShowSalesModal] = useState(false);

  const fetchInfo = useCallback(async () => {
    // Latest inventory upload
    const { data: invUpload } = await supabase
      .from("inventory_uploads")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let invRows = 0;
    if (invUpload) {
      const { count } = await supabase
        .from("inventory_snapshot_items")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", invUpload.id);
      invRows = count ?? 0;
    }

    setInvInfo({
      date: invUpload?.created_at ?? null,
      rowCount: invUpload ? invRows : null,
    });

    // Latest sales data
    const { data: salesRow } = await supabase
      .from("sales_orders_raw")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: salesCount } = await supabase
      .from("sales_orders_raw")
      .select("id", { count: "exact", head: true });

    setSalesInfo({
      date: salesRow?.created_at ?? null,
      rowCount: salesCount ?? null,
    });
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  function fmtDate(d: string | null): string {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="px-4 md:px-8 py-6 md:py-8 space-y-6">
      <PageHeader subtitle="Upload and manage your inventory, sales, and financial data" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inventory Upload Card */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50">
              <FileSpreadsheet size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Inventory Data</h2>
              <p className="text-xs text-gray-500">Current stock levels, allocations, and on-order quantities</p>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Last uploaded</span>
              <span className={clsx("text-xs font-medium", invInfo.date ? "text-gray-700" : "text-gray-400")}>
                {fmtDate(invInfo.date)}
              </span>
            </div>
            {invInfo.rowCount !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Records</span>
                <span className="text-xs font-medium text-gray-700 tabular-nums">
                  {invInfo.rowCount.toLocaleString()} items
                </span>
              </div>
            )}

            {invInfo.date && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle size={12} />
                <span>Data loaded</span>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={() => setShowInventoryModal(true)}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition w-full justify-center"
            >
              <Upload size={14} />
              Upload Inventory
            </button>
          </div>
        </div>

        {/* Sales Upload Card */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-50">
              <ShoppingCart size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Sales Data</h2>
              <p className="text-xs text-gray-500">Order history used for trends, forecasting, and customer analysis</p>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Last uploaded</span>
              <span className={clsx("text-xs font-medium", salesInfo.date ? "text-gray-700" : "text-gray-400")}>
                {fmtDate(salesInfo.date)}
              </span>
            </div>
            {salesInfo.rowCount !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Records</span>
                <span className="text-xs font-medium text-gray-700 tabular-nums">
                  {salesInfo.rowCount.toLocaleString()} orders
                </span>
              </div>
            )}

            {salesInfo.date && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle size={12} />
                <span>Data loaded</span>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={() => setShowSalesModal(true)}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition w-full justify-center"
            >
              <Upload size={14} />
              Upload Sales
            </button>
          </div>
        </div>
      </div>

      {/* ─── Financials Section ─── */}
      <div className="pt-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Financials — QuickBooks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* P&L Upload Card */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50">
                <DollarSign size={18} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Profit & Loss</h2>
                <p className="text-xs text-gray-500">P&L statement exported from QuickBooks</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Last uploaded</span>
                <span className="text-xs font-medium text-gray-400">Never</span>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-xs text-amber-700">
                  Coming soon — upload format is being finalized.
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <button
                disabled
                className="flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed transition w-full justify-center"
              >
                <Upload size={14} />
                Upload P&L
              </button>
            </div>
          </div>

          {/* Balance Sheet Upload Card */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-50">
                <BarChart3 size={18} className="text-violet-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Balance Sheet</h2>
                <p className="text-xs text-gray-500">Balance sheet exported from QuickBooks</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Last uploaded</span>
                <span className="text-xs font-medium text-gray-400">Never</span>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-xs text-amber-700">
                  Coming soon — upload format is being finalized.
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <button
                disabled
                className="flex items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed transition w-full justify-center"
              >
                <Upload size={14} />
                Upload Balance Sheet
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <InventoryUploadModal
        open={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        onUploaded={fetchInfo}
      />

      <SalesUploadModal
        open={showSalesModal}
        onClose={() => setShowSalesModal(false)}
        onUploaded={fetchInfo}
      />
    </div>
  );
}
