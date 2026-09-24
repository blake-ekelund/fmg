import type { LibraryImage } from "@/lib/email/generatePrompt";
import { fetchLibraryImages } from "@/lib/email/libraryImages";
import { brandCollection, listPhotos, unsplashConfigured, type UnsplashSource } from "@/lib/unsplash";

/**
 * The images an AI generator (blog or email) may place: our tagged Image
 * Library photos plus the brand's Unsplash collection. Each generator checks
 * its output against this same list afterwards (lib/blog/generateImages.ts,
 * lib/email/generateImages.ts), so the model can't ship an invented URL.
 */

export type ImageCandidate = LibraryImage & {
  source: "library" | "unsplash";
  /** Unsplash only: the photographer's name, for the credit. */
  photographer?: string;
  /** Unsplash only: "Photo by <name> on Unsplash". */
  credit?: string;
  /** Unsplash only: ping when the photo is used (API guideline). */
  downloadLocation?: string;
};

/**
 * `brands` are generator brand keys ("Sassy", "NI", "sassy", "ni", "both").
 * Either half can come back empty (no metadata rows yet, no Unsplash key, a
 * failed request) and generation still works with the rest.
 */
export async function gatherImageCandidates(
  brands: string[],
  { library = 20, stock = 30 }: { library?: number; stock?: number } = {},
): Promise<ImageCandidate[]> {
  const keys = brands.flatMap((b) => (b.toLowerCase() === "both" ? ["sassy", "ni"] : [b]));
  const collections = keys.map(brandCollection).filter((c): c is UnsplashSource => c !== null);

  const [lib, photos] = await Promise.all([
    fetchLibraryImages(library),
    collections.length && unsplashConfigured()
      ? listPhotos(1, collections).then((r) => r.photos).catch(() => [])
      : Promise.resolve([]),
  ]);

  return [
    ...lib.map((i): ImageCandidate => ({ ...i, source: "library" })),
    ...photos.slice(0, stock).map(
      (p): ImageCandidate => ({
        url: p.url,
        title: null,
        alt: p.alt,
        description: p.description,
        source: "unsplash",
        photographer: p.photographer.name,
        credit: `Photo by ${p.photographer.name} on Unsplash`,
        downloadLocation: p.downloadLocation,
      }),
    ),
  ];
}
