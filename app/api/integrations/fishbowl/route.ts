import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured } from "@/lib/fishbowl";
import {
  FISHBOWL_SCHEDULE_LABEL,
  FISHBOWL_SYNC_HOURS_ET,
  FISHBOWL_INVENTORY_SCHEDULE_LABEL,
  FISHBOWL_INVENTORY_SYNC_HOURS_ET,
} from "@/lib/integrations";

export const runtime = "nodejs";

/**
 * GET /api/integrations/fishbowl
 *
 * Live status for the Fishbowl integration card on /integrations. Returns
 * whether the connection is configured (env vars — server-only, so the browser
 * can't check it) and one entry per data feed (sales orders, inventory): the
 * schedule, the most recent pull, and the most recent successful pull. Each
 * sync stamps a "Fishbowl sync · …" audit row; we read those here.
 *
 * Auth: any signed-in portal user (Bearer access token).
 */

const nf = new Intl.NumberFormat("en-US");

type Feed = {
  key: "sales" | "inventory";
  title: string;
  scheduleLabel: string;
  frequency: string;
  hoursEt: number[];
  syncPath: string;
  lastSync: { at: string; status: "complete" | "processing" | "failed"; error: string | null; summary: string } | null;
  lastSuccessAt: string | null;
};

async function salesFeed(): Promise<Feed> {
  const select = "created_at, status, orders_rows, items_rows, error_text";
  const [latestRes, successRes] = await Promise.all([
    supabaseServer
      .from("sales_uploads")
      .select(select)
      .ilike("original_filename_orders", "Fishbowl sync%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from("sales_uploads")
      .select("created_at")
      .ilike("original_filename_orders", "Fishbowl sync%")
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const row = latestRes.data as
    | { created_at: string; status: string | null; orders_rows: number | null; items_rows: number | null; error_text: string | null }
    | null;

  return {
    key: "sales",
    title: "Sales orders",
    scheduleLabel: FISHBOWL_SCHEDULE_LABEL,
    frequency: "3×/day",
    hoursEt: [...FISHBOWL_SYNC_HOURS_ET],
    syncPath: "/api/cron/fishbowl-sales-sync",
    lastSync: row
      ? {
          at: row.created_at,
          status: (row.status ?? "complete") as "complete" | "processing" | "failed",
          error: row.error_text,
          summary:
            row.orders_rows != null || row.items_rows != null
              ? `${nf.format(row.orders_rows ?? 0)} orders · ${nf.format(row.items_rows ?? 0)} line items`
              : "—",
        }
      : null,
    lastSuccessAt: (successRes.data as { created_at: string } | null)?.created_at ?? null,
  };
}

async function inventoryFeed(): Promise<Feed> {
  // Inventory uploads carry no status column — only successful snapshots are
  // written — so the latest sync row IS the last success.
  const { data: latest } = await supabaseServer
    .from("inventory_uploads")
    .select("id, created_at")
    .ilike("original_filename", "Fishbowl sync%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let summary = "—";
  if (latest?.id) {
    const { count } = await supabaseServer
      .from("inventory_snapshot_items")
      .select("*", { count: "exact", head: true })
      .eq("upload_id", latest.id);
    if (count != null) summary = `${nf.format(count)} parts`;
  }

  const row = latest as { id: string; created_at: string } | null;
  return {
    key: "inventory",
    title: "Inventory",
    scheduleLabel: FISHBOWL_INVENTORY_SCHEDULE_LABEL,
    frequency: "3×/day",
    hoursEt: [...FISHBOWL_INVENTORY_SYNC_HOURS_ET],
    syncPath: "/api/cron/fishbowl-inventory-sync",
    lastSync: row ? { at: row.created_at, status: "complete", error: null, summary } : null,
    lastSuccessAt: row?.created_at ?? null,
  };
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [sales, inventory] = await Promise.all([salesFeed(), inventoryFeed()]);

  return NextResponse.json({
    configured: fishbowlConfigured(),
    feeds: [sales, inventory],
  });
}
