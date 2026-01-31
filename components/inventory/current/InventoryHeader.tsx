"use client";

import InventoryUploadModal from "./InventoryUploadModal";

export default function InventoryHeader() {
  return (
    <div className="flex justify-between items-center">
      <InventoryUploadModal />
    </div>
  );
}
