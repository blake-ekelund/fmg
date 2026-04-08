"use client";

import { ImageIcon, Camera, Package, Share2 } from "lucide-react";
import Link from "next/link";
import type { AssetKPIs } from "../hooks/useDashboardAssets";

function MiniKPI({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className={`p-1.5 rounded-md ${color}`}>{icon}</div>
      <div>
        <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      </div>
    </div>
  );
}

export default function AssetOverviewView({
  kpis,
  loading,
}: {
  kpis: AssetKPIs;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKPI
          icon={<Camera size={14} className="text-violet-600" />}
          label="Photos"
          value={kpis.total_photos}
          color="bg-violet-100"
        />
        <MiniKPI
          icon={<Share2 size={14} className="text-emerald-600" />}
          label="3rd Party"
          value={kpis.third_party_photos}
          color="bg-emerald-100"
        />
        <MiniKPI
          icon={<Package size={14} className="text-blue-600" />}
          label="Media Kit SKUs"
          value={kpis.media_kit_products}
          color="bg-blue-100"
        />
        <MiniKPI
          icon={<ImageIcon size={14} className="text-amber-600" />}
          label="Product Assets"
          value={kpis.media_kit_assets}
          color="bg-amber-100"
        />
      </div>

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/assets"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Manage asset library
        </Link>
      </div>
    </div>
  );
}
