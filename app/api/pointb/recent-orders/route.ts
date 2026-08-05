import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { fishbowlConfigured, runDataQuery } from "@/lib/fishbowl";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/pointb/recent-orders
 *
 * The last ~10 Fishbowl orders that have been issued (i.e. gone to Point B) and
 * aren't estimates — for the Order Check dropdown, so a non-technical user can
 * pick a recent order instead of typing a SO number. Read-only, admin-gated.
 */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!fishbowlConfigured()) {
    return NextResponse.json({ error: "Fishbowl isn't connected." }, { status: 500 });
  }

  // Issued (dateIssued set) and past Estimate (statusId 10) = orders that have
  // actually gone to the warehouse. Most-recent first.
  const rows = await runDataQuery(
    `SELECT so.num, so.customerPO, sostatus.name AS status, qbclass.name AS channel,
            DATE(so.dateIssued) AS issued
     FROM so
     LEFT JOIN sostatus ON so.statusId = sostatus.id
     LEFT JOIN customer ON so.customerId = customer.id
     LEFT JOIN qbclass ON customer.qbClassId = qbclass.id
     WHERE so.dateIssued IS NOT NULL AND so.statusId <> 10
     ORDER BY so.id DESC LIMIT 10`,
  );

  const orders = rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      num: String(o.num),
      customerPO: (o.customerPO as string) || "",
      status: (o.status as string) || "",
      channel: (o.channel as string) || "",
      issued: (o.issued as string) || "",
    };
  });

  return NextResponse.json({ orders });
}
