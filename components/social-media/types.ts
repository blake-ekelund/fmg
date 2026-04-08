export type SocialPostStatus = "generating" | "ai_draft" | "human_review" | "ready" | "published";

export type SocialPlatform = "Instagram / Facebook";

export type SocialPost = {
  id: string;
  brand: "NI" | "Sassy";
  platform: SocialPlatform;
  post_date: string;
  caption: string | null;
  image_url: string | null;
  image_ref_url: string | null;
  image_direction: string | null;
  hashtags: string[] | null;
  cta: string | null;
  tags: string[] | null;
  status: SocialPostStatus;
  post_type: string;
  content_id: string | null;
  carousel_slides: { slide: number; text_overlay: string; image_url: string; image_desc: string; rendered_image_url?: string }[] | null;
  created_at: string;
  updated_at: string;
};

export type ColumnConfig = {
  status: SocialPostStatus;
  label: string;
  owner: string;
  accent: string;
  bgHeader: string;
};

export const COLUMNS: ColumnConfig[] = [
  { status: "ai_draft",      label: "AI Draft",      owner: "Blake", accent: "bg-purple-400", bgHeader: "bg-purple-50" },
  { status: "human_review",  label: "Human Review",  owner: "Julie", accent: "bg-blue-400",   bgHeader: "bg-blue-50" },
  { status: "ready",         label: "Ready",         owner: "Blake", accent: "bg-emerald-400", bgHeader: "bg-emerald-50" },
];
