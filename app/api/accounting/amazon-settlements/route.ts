import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAllowedPaths } from "@/components/navConfig";
import type { UserRole } from "@/components/UserContext";
import { SettlementParseError } from "@/lib/amazonSettlement";
import {
  AMAZON_PAYMENTS_PATH,
  deleteSettlement,
  getSettlement,
  getSettlementFile,
  importSettlement,
  investigateSettlement,
  pushAmazonEstimate,
  setSettlementInQbo,
  listSettlements,
} from "@/lib/amazonSettlementStore";

export const runtime = "nodejs";

/**
 * Accounting → Amazon Payments: saved settlement journal entries.
 *
 * GET                          → { ready, items: SavedSettlement[] } (newest period first)
 * GET ?settlement=<id>          → { entry }  (one entry, for its own page)
 * GET ?file=<id>                → the original uploaded file, as an attachment
 * GET ?investigate=<id>         → why its Fishbowl sales order differs (Sage's investigate tool; reads Fishbowl live)
 * POST { text, file_name }     → { saved, replaced, entry }  (parse + save; same settlement = replace)
 * POST ?estimate=<id>           → { soNum, created, poNum, lines }  (Fishbowl ESTIMATE for the settlement)
 * PATCH ?qbo=<id> { entered }   → { qboEnteredAt }  (tick / untick "in QuickBooks")
 * DELETE ?id=…                → { ok: true }  (one entry at a time — there's no delete-all)
 *
 * Gated on the page (owner/admin). Sage's import tool calls POST with the
 * user's token. `ready: false` / `saved: false` = migration not applied yet.
 */

const MAX_FILE_CHARS = 4_000_000;

async function authorize(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return null;
  return getAllowedPaths(user.access as UserRole).includes(AMAZON_PAYMENTS_PATH) ? user : null;
}

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    const fileId = params.get("file");
    if (fileId) {
      const file = await getSettlementFile(fileId);
      if (!file) return NextResponse.json({ error: "The original file wasn't kept for this entry." }, { status: 404 });
      return new NextResponse(file.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, "")}"`,
        },
      });
    }
    const investigateId = params.get("investigate");
    if (investigateId) {
      const report = await investigateSettlement(investigateId);
      if (!report) return NextResponse.json({ error: "No entry for that settlement." }, { status: 404 });
      return NextResponse.json(report);
    }
    const settlementId = params.get("settlement");
    if (settlementId) {
      const entry = await getSettlement(settlementId);
      if (!entry) return NextResponse.json({ error: "No entry for that settlement." }, { status: 404 });
      return NextResponse.json({ entry });
    }
    return NextResponse.json(await listSettlements());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const estimateFor = new URL(request.url).searchParams.get("estimate");
  if (estimateFor) {
    try {
      return NextResponse.json(await pushAmazonEstimate(estimateFor));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't create the estimate." }, { status: 500 });
    }
  }
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; file_name?: unknown };
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Send the settlement file's text." }, { status: 400 });
  }
  if (body.text.length > MAX_FILE_CHARS) return NextResponse.json({ error: "That file is too large." }, { status: 413 });
  const fileName = typeof body.file_name === "string" ? body.file_name.slice(0, 200) : null;
  try {
    return NextResponse.json(await importSettlement(body.text, fileName, user.id));
  } catch (e) {
    const status = e instanceof SettlementParseError ? 400 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't import that file." }, { status });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pass the entry's id." }, { status: 400 });
  try {
    await deleteSettlement(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("qbo");
  const body = (await request.json().catch(() => ({}))) as { entered?: unknown };
  if (!id || typeof body.entered !== "boolean") {
    return NextResponse.json({ error: "Pass ?qbo=<settlement id> and { entered: true|false }." }, { status: 400 });
  }
  try {
    return NextResponse.json(await setSettlementInQbo(id, body.entered, user.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save that." }, { status: 500 });
  }
}
