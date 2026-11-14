import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { metaKey, PRODUCT_BUCKET, type Bucket } from "@/lib/images/registry";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/image-cleanup — daily.
 *
 * Deletes files the image backfill replaced (duplicates collapsed to one copy,
 * oversized originals swapped for web-sized versions) once their 30-day grace
 * period in `image_delete_queue` is over — long enough for any email or link
 * still pointing at an old URL to have been opened. A product file that has
 * somehow been linked again since is kept (and dropped from the queue).
 * Cron (CRON_SECRET) or internal staff by hand.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && (request.headers.get("authorization") ?? "") === `Bearer ${cronSecret}`;
  if (!isCron && !(await requireInternalUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("image_delete_queue")
    .select("bucket, path")
    .lte("delete_after", new Date().toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  let kept = 0;
  for (const row of (data ?? []) as { bucket: Bucket; path: string }[]) {
    if (row.bucket === PRODUCT_BUCKET) {
      const [{ count: links }, { count: fis }] = await Promise.all([
        supabaseServer.from("media_kit_assets").select("id", { count: "exact", head: true }).eq("storage_path", row.path),
        supabaseServer.from("fragrance_images").select("id", { count: "exact", head: true }).eq("storage_path", row.path),
      ]);
      if ((links ?? 0) > 0 || (fis ?? 0) > 0) {
        kept++;
        await supabaseServer.from("image_delete_queue").delete().eq("bucket", row.bucket).eq("path", row.path);
        continue;
      }
    }
    const { error: rmErr } = await supabaseServer.storage.from(row.bucket).remove([row.path]);
    if (rmErr) continue;
    await supabaseServer.from("email_asset_meta").delete().eq("path", metaKey(row.bucket, row.path));
    await supabaseServer.from("image_delete_queue").delete().eq("bucket", row.bucket).eq("path", row.path);
    deleted++;
  }
  return NextResponse.json({ deleted, kept, due: data?.length ?? 0 });
}
