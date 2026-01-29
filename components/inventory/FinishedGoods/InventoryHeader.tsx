import InventoryModeSwitch from "./InventoryModeSwitch";
import InventorySnapshotMeta from "./InventorySnapshotMeta";
import InventoryUploadModal from "./InventoryUploadModal";

export default function InventoryHeader({
  mode,
  setMode,
}: {
  mode: "fg" | "bom";
  setMode: (m: "fg" | "bom") => void;
}) {
  return (
    <header className="flex items-start justify-between gap-6">
      {/* Left: title + context */}
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">
          Inventory
        </h1>

        <p className="text-gray-500 max-w-xl">
          Current stock levels across warehouses, vans, and materials.
        </p>

        <InventorySnapshotMeta />

        <InventoryModeSwitch mode={mode} setMode={setMode} />
      </div>

      {/* Right: primary action */}
      <InventoryUploadModal />
    </header>
  );
}
