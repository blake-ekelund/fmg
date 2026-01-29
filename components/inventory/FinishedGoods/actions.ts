"use server";

type InventoryUploadMeta = {
  warehouse: string;
  pulledDate: string;
};

export async function uploadInventorySnapshot(
  file: File,
  meta: InventoryUploadMeta
) {
  const { warehouse, pulledDate } = meta;

  // basic guards
  if (!file) throw new Error("No file provided");
  if (!warehouse) throw new Error("Warehouse required");
  if (!pulledDate) throw new Error("Pulled date required");

  // Example: parse file, upload to Supabase, etc.
  // parseInventoryFile(file)
  // await supabase.from("inventory_snapshots").insert(...)

  console.log("Uploading inventory", {
    warehouse,
    pulledDate,
    fileName: file.name,
  });
}
