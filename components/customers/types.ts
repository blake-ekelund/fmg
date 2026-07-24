export type Customer = {
  customerid: string;
  name: string;
  bill_to_state: string;
  channel: string;
  first_order_date: string | null;
  last_order_date: string | null;
  last_order_amount: number | null;
  sales_2023: number | null;
  sales_2024: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
  total_orders?: number | null;
  total_spend?: number | null;
  agency_code?: string | null;
  rep_name?: string | null;
  /** Live estimate or in-flight order — forces the status badge to Active. */
  has_open_order?: boolean;
};

export type D2CCustomer = {
  /**
   * Declared so the shared list components can read it uniformly, but D2C never
   * sets it: these rows are keyed by person_key while `customerid` is the shared
   * storefront account, so an open-order lookup by customerid would mark every
   * D2C shopper active off a single storefront order.
   */
  has_open_order?: undefined;
  person_key: string;
  name: string;
  email: string | null;
  bill_to_state: string | null;
  customerid: string;
  channel: string;
  first_order_date: string | null;
  last_order_date: string | null;
  lifetime_orders: number;
  lifetime_revenue: number;
  lifetime_aov: number;
  sales_2023: number | null;
  sales_2024: number | null;
  sales_2025: number | null;
  sales_2026: number | null;
};

export type OrderItem = {
  sku: string;
  description: string;
  quantity: number;
  price: number;
};

export type Order = {
  id: string;
  datecompleted: string;
  totalprice: number;
  channel: string;
  items?: OrderItem[];
};