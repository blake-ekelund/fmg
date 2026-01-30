export type Platform = "Instagram" | "Facebook" | "TikTok" | "Blog";
export type ContentStatus = "Not Started" | "Ready" | "In Progress";
export type ViewMode = "calendar" | "table";

export type ContentItem = {
  id: string;
  publish_date: string; // YYYY-MM-DD
  platform: Platform;
  content_type: string;
  strategy: string;
  description: string;
  status: ContentStatus;
};
