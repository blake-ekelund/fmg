import { supabase } from "@/lib/supabaseClient";
import { resizeImageForEmail } from "./resizeImage";

/**
 * Resize an image for email and upload it to the public email-assets bucket,
 * returning its hosted URL. Shared by the block editor (image blocks, section
 * backgrounds) so every path gets the same slimming + hosting treatment.
 */
export async function uploadEmailImage(
  file: File,
  prefix = "sections",
): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  const resized = await resizeImageForEmail(file);
  const safe = resized.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${prefix}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("email-assets").upload(path, resized.blob, {
    cacheControl: "31536000",
    contentType: resized.type,
    upsert: false,
  });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from("email-assets").getPublicUrl(path);
  return { url: data.publicUrl };
}
