import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import { renderBlocksToEmailHtml } from "@/lib/email/renderBlocks";
import { applyMergeFields, currentQuarterLabel } from "@/lib/email/send";
import type { EmailBlock } from "@/components/templates/types";

export const runtime = "nodejs";

/** Stand-ins so the preview doesn't show raw {{tokens}}. */
const SAMPLE = {
  firstName: "Alex",
  customerName: "Acme Goods Co.",
  city: "Sacramento",
  state: "California",
  channel: "GIFT",
  lifetimeRevenue: 12450,
  lifetimeOrders: 5,
  lastOrderDate: new Date().toISOString(),
  daysSinceLastOrder: 124,
  senderName: "Your Name",
  senderFirstName: "Your",
  senderEmail: "you@fragrance-marketing-group.com",
  currentYear: String(new Date().getFullYear()),
  currentQuarter: currentQuarterLabel(),
};

/**
 * GET /api/email/block-templates/{id}/preview
 *
 * Returns the exact HTML the send route would produce for this template, with
 * sample merge values substituted — so "preview" and "send" can't drift.
 * Tracking links and the open pixel are not applied (those are per-message).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("email_templates")
    .select("name, preview_text, blocks")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const blocks = (data.blocks ?? []) as EmailBlock[];
  const html = renderBlocksToEmailHtml(Array.isArray(blocks) ? blocks : [], {
    previewText: (data.preview_text as string | null) ?? undefined,
  });

  return new NextResponse(applyMergeFields(html, SAMPLE), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never let a browser or CDN hold on to a template preview.
      "Cache-Control": "no-store",
    },
  });
}
