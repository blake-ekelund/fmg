import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { SOCIAL_BRANDS, type BrandConnection, type MetaConnectionStatus } from "@/lib/social/types";
import { MetaError, brandAccount, fbPageProfile, igProfile, igQuota, listVisiblePages, metaConfigured, pageIdFor } from "@/lib/social/meta";

export const runtime = "nodejs";

/**
 * GET /api/social/status — is Meta connected, and which Page / Instagram
 * account each brand will post to. A brand with no Page id is simply
 * `configured: false` (not set up yet), not an error.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!metaConfigured()) {
    return NextResponse.json({
      configured: false,
      brands: SOCIAL_BRANDS.map((brand) => ({
        brand,
        configured: false,
        ok: false,
        facebook: null,
        instagram: null,
        error: "META_ACCESS_TOKEN isn't set.",
      })),
    } satisfies MetaConnectionStatus);
  }

  const brands = await Promise.all(
    SOCIAL_BRANDS.map(async (brand): Promise<BrandConnection> => {
      if (!pageIdFor(brand)) {
        return { brand, configured: false, ok: false, facebook: null, instagram: null, error: `${brand} isn't connected to Meta yet.` };
      }
      try {
        const a = await brandAccount(brand);
        // Avatars + follower counts are decoration — never fail the status over them.
        const [fb, ig, quota] = await Promise.all([
          fbPageProfile(a).catch(() => null),
          a.igUserId ? igProfile(a).catch(() => null) : null,
          a.igUserId ? igQuota(a) : null,
        ]);
        return {
          brand,
          configured: true,
          ok: !!a.igUserId,
          facebook: { id: a.pageId, name: a.pageName, pictureUrl: fb?.pictureUrl, link: fb?.link, followers: fb?.followers },
          instagram: a.igUserId
            ? {
                id: a.igUserId,
                username: ig?.username ?? a.igUsername,
                quota,
                pictureUrl: ig?.profilePictureUrl,
                followers: ig?.followers,
              }
            : null,
          error: a.igUserId ? null : "No Instagram Business account is linked to this Page.",
        };
      } catch (e) {
        return {
          brand,
          configured: true,
          ok: false,
          facebook: null,
          instagram: null,
          error: e instanceof MetaError || e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );

  const status: MetaConnectionStatus = { configured: true, brands };
  // Setup helper: only while no brand has a Page id at all.
  if (brands.every((b) => !b.configured)) {
    try {
      status.visiblePages = await listVisiblePages();
    } catch (e) {
      status.visiblePagesError = e instanceof Error ? e.message : String(e);
    }
  }
  return NextResponse.json(status);
}
