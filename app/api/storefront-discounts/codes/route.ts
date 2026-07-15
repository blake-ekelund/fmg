import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * One-time codes for a unique-code discount (storefront_discount_codes).
 * GET ?discountId= lists a batch; POST generates more. Managed by FMG admins
 * (service role); the storefront validates redemptions via the public view.
 */

const MAX_PER_REQUEST = 1000;
// Unambiguous alphabet — no 0/O/1/I/L so codes are easy to read and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LEN = 6;

function isMissingTable(message: string | undefined): boolean {
  return !!message && /schema cache|does not exist|relation/i.test(message);
}

function batchTableMissing() {
  return NextResponse.json(
    {
      error:
        "The storefront_discount_codes table doesn't exist yet — apply the pending migration (npx supabase db push).",
      needsMigration: true,
    },
    { status: 503 }
  );
}

function randToken(len: number): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const discountId = new URL(request.url).searchParams.get("discountId");
  if (!discountId) {
    return NextResponse.json({ error: "discountId required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("storefront_discount_codes")
    .select("id, code, redeemed_at, order_id, created_at")
    .eq("discount_id", discountId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error.message)) return batchTableMissing();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const discountId = body?.discountId ? String(body.discountId) : "";
  const count = Math.floor(Number(body?.count));
  const prefix = String(body?.prefix ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  if (!discountId) {
    return NextResponse.json({ error: "discountId required" }, { status: 400 });
  }
  if (!Number.isFinite(count) || count <= 0) {
    return NextResponse.json({ error: "count must be a positive number" }, { status: 400 });
  }
  if (count > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `can't generate more than ${MAX_PER_REQUEST} codes at once` },
      { status: 400 }
    );
  }

  // Generate a unique-within-batch set; the DB unique constraint guards the rest.
  const set = new Set<string>();
  let guard = count * 20;
  while (set.size < count && guard-- > 0) {
    const token = randToken(TOKEN_LEN);
    set.add(prefix ? `${prefix}-${token}` : token);
  }
  const rows = [...set].map((code) => ({ discount_id: discountId, code }));

  const { data, error } = await supabaseServer
    .from("storefront_discount_codes")
    .insert(rows)
    .select("id, code, redeemed_at, order_id, created_at");
  if (error) {
    if (isMissingTable(error.message)) return batchTableMissing();
    if (error.code === "23503") {
      return NextResponse.json({ error: "discount not found" }, { status: 404 });
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A generated code collided with an existing one — try again." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ created: data?.length ?? 0, codes: data ?? [] });
}
