export type ShareScope = "internal" | "third_party";

/**
 * One image in the library: either an `email-assets` upload with its editorial
 * metadata (source "library"), or a read-only Media Kit product photo
 * (source "product", path prefixed "media-kit:").
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
  source: "library" | "product";
  /** Product photos: the inventory part, for linking to the product page. */
  productPart?: string;
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
};

export type MetaPatch = {
  title?: string;
  altText?: string;
  description?: string;
  shareScope?: ShareScope;
  folder?: string;
};
