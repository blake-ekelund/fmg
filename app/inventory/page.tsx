"use client";

import { useState } from "react";
import InventoryHeader from "@/components/inventory/FinishedGoods/InventoryHeader";
import InventoryFilters from "@/components/inventory/FinishedGoods/InventoryFilters";
import InventoryKpiGrid from "@/components/inventory/FinishedGoods/InventoryKpiGrid";
import InventoryTable from "@/components/inventory/FinishedGoods/InventoryTable";
import BomInventory from "@/components/inventory/Bom/BomInventory";

export default function InventoryPage() {
  const [mode, setMode] = useState<"fg" | "bom">("fg");

  return (
    <div className="px-8 py-10 space-y-12">
      <InventoryHeader mode={mode} setMode={setMode} />

      <InventoryFilters />

      <InventoryKpiGrid mode={mode} />

      {mode === "fg" ? <InventoryTable /> : <BomInventory />}
    </div>
  );
}
