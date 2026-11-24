export type ShareScope = "internal" | "third_party";

/**
 * One image in the library: either an `email-assets` upload with its editorial
 * metadata (source "library"), a read-only Media Kit product photo
 * (source "product", path prefixed "media-kit:"), or a read-only photo from
 * one of our Unsplash collections (source "unsplash", path "unsplash:<id>").
 */
export type LibraryImage = {
  path: string;
  url: string;
  size: number;
  updatedAt: string | null;
  title: string | null;
  altText: string | null;
  description: string | null;
  shareScope: ShareScope;
  /** Folder id it's filed in — its label if re-filed, else where it was uploaded. */
  folder: string;
  source: "library" | "product" | "unsplash";
  /** Product photos: the inventory part, for linking to the product page. */
  productPart?: string;
  /** Product photos also show in these folders (their collection + category). */
  alsoIn?: string[];
  /** Unsplash: a small preview for the grid. */
  thumb?: string;
  /** Unsplash: who to credit, and where. */
  credit?: { name: string; profileUrl: string; unsplashUrl: string };
  /** Unsplash: pinged (Unsplash's rule) when the photo is copied for use. */
  downloadLocation?: string;
};

/** Where an image is used — mirrors ImageUsage in lib/images/usage.ts. */
export type ImageUsage = {
  products: { part: string; name: string; brand: string | null; viaFragrance: string | null; live: boolean }[];
  fragrances: { id: string; brand: string; fragrance: string }[];
  pages: { brand: string; slug: string; live: boolean; draft: boolean }[];
  sections: { brand: string | null; name: string; live: boolean; draft: boolean }[];
  blogPosts: { id: string; title: string; brand: string | null; live: boolean }[];
  emails: { id: string; name: string; status: string | null }[];
  liveOnSite: boolean;
  inUse: boolean;
};

/**
 * A folder. Ids are paths ("sassy-holiday/ads"); product folders start with
 * "~" and are read-only (no uploads, filing, subfolders, or delete).
 */
export type LibraryFolder = {
  id: string;
  name: string;
  readOnly: boolean;
  /** Landing folder for uploads nobody filed (Email / Blog / Library uploads). */
  kind?: "inbox";
  /** Fixed position among siblings (Collections, Categories, Products). */
  order?: number;
  /**
   * Read-only folders that still take uploads: a product folder links the
   * photo to that product; a Collections folder shares it with every product
   * of that fragrance.
   */
  accepts?: "product" | "fragrance";
};

export type MetaPatch = {
  title?: string;
  altText?: string;
  description?: string;
  shareScope?: ShareScope;
  folder?: string;
};
