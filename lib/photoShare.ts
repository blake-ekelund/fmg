import { supabaseBrowser } from "@/lib/supabase/browser";
import { Database } from "@/types/supabase";
import { PhotoAsset } from "@/types/photoShare";

type PhotoAssetInsert =
  Database["public"]["Tables"]["photo_share_assets"]["Insert"];

export async function fetchPhotoAssets(): Promise<PhotoAsset[]> {
  const supabase = supabaseBrowser();

  const { data, error } = await supabase
    .from("photo_share_assets")
    .select("*")
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch photo assets:", error);
    throw error;
  }

  return data ?? [];
}

export async function uploadPhotoAsset(payload: {
  file: File;
  title: string;
  description?: string;
  allowThirdParty: boolean;
}) {
  const supabase = supabaseBrowser();

  const file = payload.file;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext) throw new Error("Invalid file");

  const path = `uploads/${new Date().getFullYear()}/${String(
    new Date().getMonth() + 1
  ).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;

  /* ------------------------------------------------------------------ */
  /* 1. Upload to Supabase Storage                                      */
  /* ------------------------------------------------------------------ */
  const { error: uploadError } = await supabase.storage
    .from("marketing-photo-share")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError);
    throw uploadError;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Insert metadata (ARRAY INSERT — REQUIRED)                       */
  /* ------------------------------------------------------------------ */
  const record: PhotoAssetInsert = {
    file_path: path,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    title: payload.title,
    description: payload.description ?? null,
    allow_third_party_use: payload.allowThirdParty,
  };

  const { error: insertError } = await supabase
    .from("photo_share_assets")
    .insert([record]); // <-- ARRAY FIX (THIS IS THE KEY)

  if (insertError) {
    console.error("DB insert failed:", insertError);
    throw insertError;
  }
}
