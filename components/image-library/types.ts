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
};

export type MetaPatch = {
  title?: string;
  altText?: string;
  description?: string;
  shareScope?: ShareScope;
};
