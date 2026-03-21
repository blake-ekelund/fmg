// /shopify/types.ts
export type ShopifyDateRange =
  | "current_month"
  | "last_month"
  | "this_year"
  | "last_year";

export type ShopifyAggregatedData = {
  online_store_visitors: number;
  sessions: number;
  sessions_reached_checkout: number;
  total_orders: number;
  conversion_rate: number;
  total_amount_spent_per_order: number;
  total_amount_spent: number;
  total_shipping_charges: number;
};
