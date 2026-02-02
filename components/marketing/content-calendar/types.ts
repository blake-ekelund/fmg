/* ----------------------------------
   Existing types — unchanged
---------------------------------- */

export type Platform = "Instagram" | "Facebook" | "TikTok" | "Blog";
export type Brand = "NI" | "Sassy";

export type BrandView = "all" | Brand;
export type ViewMode = "calendar" | "table";

export type ContentStatus =
  | "Not Started"
  | "Ready"
  | "In Progress";

/**
 * Calendar / table / persisted content
 * DO NOT MODIFY — used elsewhere
 */
export type ContentItem = {
  id: string;
  publish_date: string; // YYYY-MM-DD
  brand: Brand;
  platform: Platform;
  content_type: string;
  strategy: string;
  description: string;
  status: ContentStatus;
};

/* ----------------------------------
   NEW: Editor / Draft state
---------------------------------- */

/**
 * Used ONLY inside the Add/Edit modal
 * Allows drafts and unsaved content
 */
export type ContentDraft = {
  id?: string;
  publish_date: string | null;
  brand: Brand;
  platform: Platform;
  content_type: string;
  strategy: string;
  description: string;
  status: ContentStatus;
};

/**
 * Used ONLY for Activity / metadata
 */
export type ContentMeta = {
  id: string;
  created_at: string;
  updated_at?: string;
};
