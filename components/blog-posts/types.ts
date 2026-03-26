export type BlogPostStatus = "ai_draft" | "human_review" | "ready" | "published";

export type BlogPost = {
  id: string;
  title: string;
  body: string;
  seo_meta: string | null;
  tags: string[] | null;
  brand: "NI" | "Sassy";
  status: BlogPostStatus;
  created_at: string;
  updated_at: string;
};

export type ColumnConfig = {
  status: BlogPostStatus;
  label: string;
  accent: string;    // border/dot color
  bgHeader: string;  // header background
  count?: number;
};

export const COLUMNS: ColumnConfig[] = [
  { status: "ai_draft",      label: "AI Draft",      accent: "bg-purple-400", bgHeader: "bg-purple-50" },
  { status: "human_review",  label: "Human Review",  accent: "bg-blue-400",   bgHeader: "bg-blue-50" },
  { status: "ready",         label: "Ready",         accent: "bg-emerald-400", bgHeader: "bg-emerald-50" },
];
