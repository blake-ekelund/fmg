export type Platform = "Instagram" | "Facebook" | "TikTok" | "Blog";
export type Brand = "NI" | "Sassy";

export type BrandView = "all" | Brand;
export type ViewMode = "calendar" | "table";

export type ContentStatus =
  | "Not Started"
  | "Ready"
  | "In Progress";

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
