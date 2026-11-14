import { uploadToFolder } from "@/lib/images/client";
import { resizeImageForEmail } from "./resizeImage";

/**
 * Resize an image for email and upload it through the shared upload path
 * (de-duplicated, described by Sage) into the email-assets bucket, returning
 * its hosted URL. Shared by the block editor (image blocks, section
 * backgrounds) so every path gets the same slimming + hosting treatment.
 */
export async function uploadEmailImage(
  file: File,
  prefix = "email-uploads",
): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "That file isn't an image." };
  const resized = await resizeImageForEmail(file);
  const res = await uploadToFolder(resized.blob, prefix, resized.name);
  return "error" in res ? res : { url: res.url };
}
