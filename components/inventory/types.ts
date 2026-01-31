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

export type Product = {
  id?: string;

  part: string;
  display_name: string;
  product_type: "FG" | "BOM";
  fragrance: string | null;
  size: string | null;
  part_type: string;

  cogs: number;
  min_qty: number;
  max_qty: number;

  is_forecasted: boolean;

  // 👇 newly added, default 0 for now
  lead_time_months: number;
  avg_monthly_demand: number;
};
