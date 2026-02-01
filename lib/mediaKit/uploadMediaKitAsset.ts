import { supabase } from "@/lib/supabaseClient";

type AssetType =
  | "front"
  | "benefits"
  | "lifestyle"
  | "ingredients"
  | "fragrance"
  | "other";

export async function uploadMediaKitAsset({
  file,
  part,
  assetType,
}: {
  file: File;
  part: string;
  assetType: AssetType;
}) {
  const ext = file.name.split(".").pop();
  const filename = `${assetType}-${Date.now()}.${ext}`;

  const storagePath = `inventory_products/${part}/${assetType}/${filename}`;

  // 1. Upload to storage
  const { error: uploadError } = await supabase.storage
    .from("media-kit")
    .upload(storagePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  // 2. Insert DB record
  const { error: insertError } = await supabase
    .from("media_kit_assets")
    .insert({
      part,
      asset_type: assetType,
      storage_path: storagePath,
    });

  if (insertError) throw insertError;

  return storagePath;
}
