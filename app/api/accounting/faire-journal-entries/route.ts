import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { getAllowedPaths } from "@/components/navConfig";
import type { UserRole } from "@/components/UserContext";
import { FAIRE_PAYOUTS_PATH } from "@/lib/fairePayoutsStore";
import {
  createFaireJournalEntry,
  deleteFaireJournalEntry,
  getFaireJournalEntry,
  listFaireJournalEntries,
  setFaireJournalEntryInQbo,
} from "@/lib/faireJournalStore";

export const runtime = "nodejs";

/**
 * Faire journal entries (Accounting → Faire Payouts → Journal Entries).
 *
 * GET                         → { ready, entries }  (newest first, no payout snapshots)
 * GET ?id=<uuid>               → { entry }  (with the payouts/orders snapshot)
 * POST { dates[] }             → { entry }  (one entry for those payouts; refuses payouts already in one)
 * PATCH { id, entered }        → tick / untick "Entered in QBO" (the entry and its payouts)
 * DELETE ?id=<uuid>            → delete the entry; its payouts become free again
 *
 * Owner/admin — the same gate as Faire Payouts.
 */

async function authorize(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return null;
  return getAllowedPaths(user.access as UserRole).includes(FAIRE_PAYOUTS_PATH) ? user : null;
}

const fail = (e: unknown, fallback: string, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : fallback }, { status });

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const entry = await getFaireJournalEntry(id);
      if (!entry) return NextResponse.json({ error: "No such journal entry." }, { status: 404 });
      return NextResponse.json({ entry });
    }
    return NextResponse.json(await listFaireJournalEntries());
  } catch (e) {
    return fail(e, "Couldn't load journal entries.");
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { dates?: unknown };
  if (!Array.isArray(body.dates)) return NextResponse.json({ error: "Send { dates: [...] }." }, { status: 400 });
  try {
    return NextResponse.json({ entry: await createFaireJournalEntry(body.dates.map(String), user.id) });
  } catch (e) {
    return fail(e, "Couldn't create the journal entry.", 400);
  }
}

export async function PATCH(request: Request) {
  const user = await authorize(request);
  if (!user) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; entered?: unknown };
  if (typeof body.id !== "string" || typeof body.entered !== "boolean") {
    return NextResponse.json({ error: "Send { id, entered: true|false }." }, { status: 400 });
  }
  try {
    await setFaireJournalEntryInQbo(body.id, body.entered, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "Couldn't save that.");
  }
}

export async function DELETE(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pass ?id=" }, { status: 400 });
  try {
    await deleteFaireJournalEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "Couldn't delete it.");
  }
}
