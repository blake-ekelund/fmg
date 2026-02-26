export type Customer = {
  customerid: string;
  name: string;
  bill_to_state: string;
  channel: string;
  first_order_date: string;
  last_order_date: string;
  last_order_amount: number;
  sales_2023: number;
  sales_2024: number;
  sales_2025: number;
  sales_2026: number;
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