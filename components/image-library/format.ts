import type { LibraryImage } from "./types";

/** Last path segment, minus the upload timestamp prefix (e.g. 1699-hero.jpg). */
export function fileName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/^\d+-/, "");
}

/** "1699-spring_hero-banner.jpg" → "Spring hero banner" — readable when there's no title. */
export function displayName(img: LibraryImage): string {
  if (img.title) return img.title;
  const words = fileName(img.path)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_t20_[A-Za-z0-9]+$/, "") // stock-photo id suffix
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled";
}
