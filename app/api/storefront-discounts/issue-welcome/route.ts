import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * POST /api/storefront-discounts/issue-welcome
 *
 * Mints ONE unique single-use code under the "WELCOME15" unique-code batch and
 * returns it, so a storefront can email a personal welcome code to a brand-new
 * newsletter subscriber. Storefronts authenticate with STOREFRONT_NOTIFY_SECRET
 * (the same shared secret as the ops-notify relay). FMG stays the source of
 * truth for discount codes — the storefront never writes the discount tables.
 *
 * Locked down: only mints from an ACTIVE, in-window, unique_codes batch, so a
 * leaked secret can at most spray extra single-use welcome codes (low value).
 */

// Unambiguous alphabet — matches the batch generator (no 0/O/1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LEN = 6;
const DEFAULT_BATCH = "WELCOME15";

function token(): string {
  const bytes = new Uint8Array(TOKEN_LEN);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < TOKEN_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_NOTIFY_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { batchCode?: string };
  const batchCode = String(body.batchCode ?? DEFAULT_BATCH)
    .trim()
    .toUpperCase();

  const { data: parent, error: parentErr } = await supabaseServer
    .from("storefront_discounts")
    .select("id, code, kind, value, active, unique_codes, starts_at, ends_at")
    .eq("code", batchCode)
    .maybeSingle();
  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 500 });
  }
  if (!parent || !parent.unique_codes) {
    return NextResponse.json(
      {
        error: `No unique-code batch named "${batchCode}" — create it in FMG → Discounts (tick "Unique one-time codes").`,
      },
      { status: 404 }
    );
  }

  const now = Date.now();
  const live =
    parent.active &&
    (!parent.starts_at || new Date(parent.starts_at).getTime() <= now) &&
    (!parent.ends_at || new Date(parent.ends_at).getTime() >= now);
  if (!live) {
    return NextResponse.json({ error: "welcome offer is not active" }, { status: 409 });
  }

  // Mint one code; retry on the (astronomically rare) unique collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = `${parent.code}-${token()}`;
    const { error } = await supabaseServer
      .from("storefront_discount_codes")
      .insert({ discount_id: parent.id, code });
    if (!error) {
      return NextResponse.json({ code, kind: parent.kind, value: parent.value });
    }
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { error: "could not mint a unique code, try again" },
    { status: 409 }
  );
}
