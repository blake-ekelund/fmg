import { supabaseServer } from "@/lib/supabaseServer";
import type { LibraryImage } from "./generatePrompt";

/**
 * Curated brand images (Image Library metadata) an AI generator may place.
 * Shared by the email and blog generators. Returns [] when the sidecar table
 * isn't migrated yet — generation still works without images.
 */
export async function fetchLibraryImages(limit = 30): Promise<LibraryImage[]> {
  try {
    const { data, error } = await supabaseServer
      .from("email_asset_meta")
      .select("path, title, alt_text, description")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => {
      const row = r as { path: string; title: string | null; alt_text: string | null; description: string | null };
      const { data: pub } = supabaseServer.storage.from("email-assets").getPublicUrl(row.path);
      return { url: pub.publicUrl, title: row.title, alt: row.alt_text, description: row.description };
    });
  } catch {
    return [];
  }
}
