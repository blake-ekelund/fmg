import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { listSiteCollections, productsInCollection } from "@/lib/social/collections";
import { listBrandProducts } from "@/lib/social/generate";
import { isSocialBrand } from "@/lib/social/types";

export const runtime = "nodejs";

/** GET /api/social/collections?brand=NI — the store's collections, for "make the grid about a collection". */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const brand = new URL(request.url).searchParams.get("brand");
  if (!isSocialBrand(brand)) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });

  const [collections, products] = await Promise.all([listSiteCollections(brand), listBrandProducts(brand)]);
  return NextResponse.json({
    collections: collections.map((c) => ({
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      products: productsInCollection(brand, c.slug, products).length,
    })),
  });
}
