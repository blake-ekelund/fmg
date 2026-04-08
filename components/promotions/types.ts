export type DiscountType = "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y";
export type PromotionStatus = "draft" | "active" | "scheduled" | "expired" | "paused";
export type PromotionChannel = "wholesale" | "d2c" | "both";
export type PromotionBrand = "ni" | "sassy" | "both";
export type AppliesTo = "all" | "specific_products" | "specific_collections";
export type AllocationMethod = "across" | "each";
export type PressChannel = "blog" | "social" | "email";

export interface Promotion {
  id: string;
  name: string;
  description: string | null;
  brand: PromotionBrand;
  channel: PromotionChannel;

  discount_type: DiscountType;
  discount_value: number | null;
  minimum_purchase: number | null;
  max_uses: number | null;
  current_uses: number;
  one_per_customer: boolean;
  allocation_method: AllocationMethod;

  code: string | null;
  auto_apply: boolean;

  shopify_discount_id: string | null;
  shopify_synced: boolean;

  applies_to: AppliesTo;
  product_ids: string[] | null;
  collection_tags: string[] | null;
  /** Shopify collection IDs for entitled_collection_ids */
  collection_ids: string[] | null;

  buy_quantity: number | null;
  get_quantity: number | null;
  /** Discount % on the "get" items for BXGY (default 100 = free) */
  get_discount_percent: number | null;

  /** Marketing channels to reference this promo in */
  press_channels: PressChannel[];

  starts_at: string;
  ends_at: string | null;

  status: PromotionStatus;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  type: "custom" | "smart";
}

export interface PromotionRedemption {
  id: string;
  promotion_id: string;
  customer_email: string | null;
  order_id: string | null;
  order_source: "shopify" | "wholesale" | "manual" | null;
  discount_applied: number | null;
  redeemed_at: string;
}

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Percentage Off",
  fixed_amount: "Fixed Amount Off",
  free_shipping: "Free Shipping",
  buy_x_get_y: "Buy X Get Y",
};

/** User-facing labels — uses "promotion" terminology */
export const PROMO_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "% Off",
  fixed_amount: "$ Off",
  free_shipping: "Free Shipping",
  buy_x_get_y: "Bundle",
};

export const STATUS_CONFIG: Record<PromotionStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  active: { label: "Active", color: "text-green-700", bg: "bg-green-100" },
  scheduled: { label: "Scheduled", color: "text-blue-700", bg: "bg-blue-100" },
  expired: { label: "Expired", color: "text-orange-700", bg: "bg-orange-100" },
  paused: { label: "Paused", color: "text-yellow-700", bg: "bg-yellow-100" },
};

export const CHANNEL_LABELS: Record<PromotionChannel, string> = {
  wholesale: "Wholesale",
  d2c: "D2C (Shopify)",
  both: "Both Channels",
};
