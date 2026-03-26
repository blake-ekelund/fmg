export type SocialPostStatus = "ai_draft" | "human_review" | "ready" | "published";

export type SocialPlatform = "Instagram" | "Facebook" | "TikTok";

export type SocialPost = {
  id: string;
  brand: "NI" | "Sassy";
  platform: SocialPlatform;
  post_date: string;
  caption: string | null;
  image_url: string | null;
  status: SocialPostStatus;
  post_type: string;
  content_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ColumnConfig = {
  status: SocialPostStatus;
  label: string;
  accent: string;
  bgHeader: string;
};

export const COLUMNS: ColumnConfig[] = [
  { status: "ai_draft",      label: "AI Draft",      accent: "bg-purple-400", bgHeader: "bg-purple-50" },
  { status: "human_review",  label: "Human Review",  accent: "bg-blue-400",   bgHeader: "bg-blue-50" },
  { status: "ready",         label: "Ready",         accent: "bg-emerald-400", bgHeader: "bg-emerald-50" },
];
