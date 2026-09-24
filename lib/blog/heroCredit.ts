import { findSourcePhoto } from "@/lib/unsplash";
import type { HeroCredit } from "./render";

/**
 * The credit for a post's hero image when it's one of our Unsplash photos
 * (anything the pickers or the AI generator offered), else null. Looked up at
 * save time rather than stored, so it always matches whatever hero is set.
 * Never throws: a lookup failure just means no credit line on this save.
 */
export async function heroCreditFor(heroUrl: string | null | undefined): Promise<HeroCredit | null> {
  if (!heroUrl?.includes("images.unsplash.com")) return null;
  try {
    const p = await findSourcePhoto(heroUrl);
    return p ? { name: p.photographer.name, profileUrl: p.photographer.profileUrl, unsplashUrl: p.unsplashUrl } : null;
  } catch {
    return null;
  }
}
