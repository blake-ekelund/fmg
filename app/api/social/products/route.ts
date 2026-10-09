import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { listBrandProducts } from "@/lib/social/generate";
import { isSocialBrand } from "@/lib/social/types";

export const runtime = "nodejs";

/**
 * GET /api/social/products?brand=Sassy|NI — the brand's published products
 * with their photos, for the wizard's product picker and the slide editor's
 * "use a product" fill.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const brand = new URL(request.url).searchParams.get("brand");
  if (!isSocialBrand(brand)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });
  return NextResponse.json({ products: await listBrandProducts(brand) });
}
