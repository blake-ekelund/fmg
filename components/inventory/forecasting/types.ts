import { Product } from "../types";

export type ForecastRow = Product & {
  on_hand: number;
  on_order: number;
  snapshot_id: string;
};
