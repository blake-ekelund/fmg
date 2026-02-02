"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { fetchPhotoAssets } from "@/lib/photoShare";
import { PhotoAsset } from "@/types/photoShare";

import PhotoGrid from "./components/PhotoGrid";
import PhotoTable from "./components/PhotoTable";
import PhotoFilters from "./components/PhotoFilters";
import ViewToggle from "./components/ViewToggle";
import UploadPhotoModal from "./components/UploadPhotoModal";
import EditPhotoModal from "./components/EditPhotoModal";

export default function PhotoSharePage() {
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [activeAsset, setActiveAsset] = useState<PhotoAsset | null>(null);

  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [thirdParty, setThirdParty] =
    useState<"all" | "yes" | "no">("all");
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setAssets(await fetchPhotoAssets());
  }

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (thirdParty === "yes" && !a.allow_third_party_use) return false;
      if (thirdParty === "no" && a.allow_third_party_use) return false;

      if (search) {
        const s = search.toLowerCase();
        return (
          a.title.toLowerCase().includes(s) ||
          (a.description ?? "").toLowerCase().includes(s)
        );
      }

      return true;
    });
  }, [assets, search, thirdParty]);

  return (
    <div className="px-4 md:px-8 py-6 space-y-6">
      {/* Header / Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Filters */}
        <PhotoFilters
          search={search}
          onSearch={setSearch}
          thirdParty={thirdParty}
          onThirdPartyChange={setThirdParty}
        />

        {/* Actions */}
        <div className="flex items-center justify-between md:justify-end gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="
              inline-flex
              items-center
              gap-2
              px-4 py-2
              rounded-xl
              bg-gray-900
              text-white
              text-sm
              font-medium
              whitespace-nowrap
            "
          >
            <Plus size={16} />
            Add Image
          </button>

          {/* View toggle only where table makes sense */}
          <div className="hidden sm:block">
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {view === "grid" ? (
          <PhotoGrid
            assets={filtered}
            onSelect={(asset) => setActiveAsset(asset)}
          />
        ) : (
          <div className="hidden sm:block">
            <PhotoTable
              assets={filtered}
              onSelect={(asset) => setActiveAsset(asset)}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <UploadPhotoModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={load}
      />

      {activeAsset && (
        <EditPhotoModal
          asset={activeAsset}
          open
          onClose={() => setActiveAsset(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
