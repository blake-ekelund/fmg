export type ShareScope = "internal" | "third_party";

/** One image in the public `email-assets` bucket + its editorial metadata. */
export type LibraryImage = {
  path: string;
  url: string;
  size: number;
  updatedAt: string | null;
  title: string | null;
  altText: string | null;
  description: string | null;
  shareScope: ShareScope;
  /** Folder it's filed in — its label if re-filed, else where it was uploaded. */
  folder: string;
};

export type MetaPatch = {
  title?: string;
  altText?: string;
  description?: string;
  shareScope?: ShareScope;
  folder?: string;
};
