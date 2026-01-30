// /shopify/components/normalize.ts
export function n(value: number | null | undefined) {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}
