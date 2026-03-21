"use client";

import { use } from "react";
import ProductDetailPage from "@/components/products/ProductDetailPage";

export default function ProductRoute({
  params,
}: {
  params: Promise<{ part: string }>;
}) {
  const { part } = use(params);
  return <ProductDetailPage partEncoded={part} />;
}
