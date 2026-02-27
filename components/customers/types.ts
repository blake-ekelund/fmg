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