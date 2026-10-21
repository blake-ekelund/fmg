import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAllowedPaths } from "@/components/navConfig";
import type { UserRole } from "@/components/UserContext";
import { SettlementParseError } from "@/lib/amazonSettlement";
import {
  AMAZON_PAYMENTS_PATH,
  deleteSettlements,
  importSettlement,
  listSettlements,
} from "@/lib/amazonSettlementStore";

export const runtime = "nodejs";

/**
 * Accounting → Amazon Payments: saved settlement journal entries.
 *
 * GET                          → { ready, items: SavedSettlement[] } (newest period first)
 * POST { text, file_name }     → { saved, replaced, entry }  (parse + save; same settlement = replace)
 * DELETE ?id=…  |  ?all=1      → { ok: true }
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
  try {
    return NextResponse.json(await listSettlements());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
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
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id && params.get("all") !== "1") return NextResponse.json({ error: "Pass id or all=1." }, { status: 400 });
  try {
    await deleteSettlements(id ? [id] : "all");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't delete." }, { status: 500 });
  }
}
