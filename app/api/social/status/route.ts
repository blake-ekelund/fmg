import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { SOCIAL_BRANDS, type BrandConnection, type MetaConnectionStatus } from "@/lib/social/types";
import { MetaError, brandAccount, igQuota, listVisiblePages, metaConfigured, pageIdFor } from "@/lib/social/meta";

export const runtime = "nodejs";

/**
 * GET /api/social/status — is Meta connected, and which Page / Instagram
 * account each brand will post to. Powers the connection strip on
 * /marketing/social.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!metaConfigured()) {
    return NextResponse.json({
      configured: false,
      brands: SOCIAL_BRANDS.map((brand) => ({
        brand,
        ok: false,
        facebook: null,
        instagram: null,
        error: "META_ACCESS_TOKEN isn't set.",
      })),
    } satisfies MetaConnectionStatus);
  }

  const brands = await Promise.all(
    SOCIAL_BRANDS.map(async (brand): Promise<BrandConnection> => {
      try {
        const a = await brandAccount(brand);
        return {
          brand,
          ok: !!a.igUserId,
          facebook: { id: a.pageId, name: a.pageName },
          instagram: a.igUserId ? { id: a.igUserId, username: a.igUsername, quota: await igQuota(a) } : null,
          error: a.igUserId ? null : "No Instagram Business account is linked to this Page.",
        };
      } catch (e) {
        return {
          brand,
          ok: false,
          facebook: null,
          instagram: null,
          error: e instanceof MetaError || e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const status: MetaConnectionStatus = { configured: true, brands };
  if (SOCIAL_BRANDS.some((b) => !pageIdFor(b))) {
    try {
      status.visiblePages = await listVisiblePages();
    } catch (e) {
      status.visiblePagesError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json(status);
}
