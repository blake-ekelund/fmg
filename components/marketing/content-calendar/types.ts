/* ----------------------------------
   Core Enums
---------------------------------- */

export type Platform =
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "Shopify"
  | "Subscriber-List";

export type Brand = "NI" | "Sassy";

export type BrandView = "all" | Brand;
export type ViewMode = "calendar" | "table";

/* ----------------------------------
   Workflow Status (Single Source of Truth)
---------------------------------- */

export type ContentStatus = "Draft" | "Review" | "Published";

/**
 * Canonical workflow order.
 * Used by timeline UI + progression logic.
 */
export const WORKFLOW_ORDER: ContentStatus[] = ["Draft", "Review", "Published"];

/* ----------------------------------
   Controlled Vocabularies
---------------------------------- */

export type ContentType =
  | "Photo"
  | "Carousel"
  | "Reel"
  | "Live"
  | "Blog"
  | "Newsletter";

export type StrategyType =
  | "Awareness"
  | "Engagement"
  | "Conversion"
  | "Retention"
  | "Launch"
  | "Education";

/* ----------------------------------
   Profile Reference (Joined)
---------------------------------- */

export type ProfileRef = {
  first_name: string;
  email: string;
};

/* ----------------------------------
   Persisted Content (DB Shape)
---------------------------------- */

export type ContentItem = {
  id: string;
  publish_date: string; // YYYY-MM-DD

  brand: Brand;
  platform: Platform;

  content_type: ContentType;
  strategy: StrategyType;

  description: string;
  status: ContentStatus;

  created_at?: string;
  updated_at?: string;
};

/* ----------------------------------
   Draft / Editor State (Strict UI)
---------------------------------- */

export type ContentDraft = {
  id?: string;

  publish_date: string | null;

  brand: Brand;
  platform: Platform;

  content_type: "" | ContentType;
  strategy: "" | StrategyType;

  description: string;
  status: ContentStatus;
};

/* ----------------------------------
   Activity System
---------------------------------- */

export type ActivityEventType = "status_changed" | "content_updated";

export type ActivityEvent = {
  id: string;
  content_id: string;
  event_type: ActivityEventType;
  event_label: string;
  metadata: {
    from?: ContentStatus;
    to?: ContentStatus;
  } | null;
  performed_by: string | null;
  created_at: string;

  // Some Supabase embedded relationships come back as arrays depending on relationship shape.
  performed_by_profile?: ProfileRef | ProfileRef[] | null;
};

/* ----------------------------------
   Metadata
---------------------------------- */

export type ContentMeta = {
  id: string;
  created_at: string;
  updated_at?: string;
};
