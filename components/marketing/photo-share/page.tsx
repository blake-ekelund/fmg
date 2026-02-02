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
  const [thirdParty, setThirdParty] = useState<"all" | "yes" | "no">("all");
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
    <div className="px-8 space-y-6">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <PhotoFilters
          search={search}
          onSearch={setSearch}
          thirdParty={thirdParty}
          onThirdPartyChange={setThirdParty}
        />
        <button
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg"
        >
          <Plus size={16} /> Add media
        </button>

        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "grid" ? (
        <PhotoGrid
        assets={filtered}
        onSelect={(asset) => setActiveAsset(asset)}
        />
      ) : (
        <PhotoTable
          assets={filtered}
          onSelect={(asset) => setActiveAsset(asset)}
        />
      )}

      <UploadPhotoModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={load}
      />

      {activeAsset && (
        <EditPhotoModal
          asset={activeAsset}
          open={!!activeAsset}
          onClose={() => setActiveAsset(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
