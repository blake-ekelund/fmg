export type InventoryRow = {
  id: string;
  upload_id: string;
  warehouse: string;

  part: string;
  description: string | null;
  uom: string | null;

  on_hand: number;
  allocated: number;
  not_available: number;
  drop_ship: number;
  available: number;
  on_order: number;
  committed: number;
  short: number;

  created_at: string;
};

export type StorefrontChannel = "d2c" | "wholesale" | "both" | "off";

export type Product = {
  id?: string;

  part: string;
  display_name: string;
  product_type: "FG" | "BOM";
  fragrance: string | null;
  size: string | null;
  part_type: string;
  brand: "NI" | "Sassy";

  cogs: number;
  min_qty: number;
  max_qty: number;

  is_forecasted: boolean;

  lead_time_months: number;
  avg_monthly_demand: number;

  // ── Storefront publish ──
  storefront_channel?: StorefrontChannel;

  // ── Pricing ──
  msrp?: number | null;
  wholesale_price?: number | null;
  case_pack?: number | null;
  moq?: number | null;
  compare_at_price?: number | null;

  // ── Marketing ──
  subtitle?: string | null;
  infused_with?: string | null;

  // ── Catalog / shipping ──
  barcode?: string | null;
  category_path?: string | null;
  weight_oz?: number | null;
  country_of_origin?: string | null;
  hs_code?: string | null;

  // ── Flexible metafields (scent, fragrance level, SPF, etc.) ──
  metafields?: Record<string, unknown>;
};
