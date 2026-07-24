import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Minting single-use storefront codes from a unique-code batch.
 *
 * Shared by every "give this shopper a personal code" endpoint (the welcome
 * email, the cart feedback reward). FMG owns the discount tables — storefronts
 * ask for a code, they never write one.
 *
 * Deliberately narrow: it will only mint from a batch that is ACTIVE, in its
 * date window, and flagged `unique_codes`. So the worst a leaked storefront
 * secret can do is spray extra single-use codes for an offer that is already
 * running — never invent a new discount, and never touch a shared code.
 */

// Unambiguous alphabet — matches the batch generator (no 0/O/1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LEN = 6;

function token(): string {
  const bytes = new Uint8Array(TOKEN_LEN);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < TOKEN_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export type MintedCode = {
  code: string;
  discountId: string;
  kind: "percent" | "fixed" | "free_item";
  value: number;
  minSubtotal: number | null;
};

/** Why a mint didn't happen. `status` is the HTTP code the caller should return. */
export type MintFailure = { error: string; status: number };

export function isMintFailure(r: MintedCode | MintFailure): r is MintFailure {
  return "error" in r;
}

/**
 * Mint one unique single-use code under `batchCode`.
 *
 * Fails rather than improvises: an unknown batch, a batch that isn't a
 * unique-code batch, or one that's paused/out of window all return a
 * MintFailure. A missed reward is recoverable; a wrongly-issued one isn't.
 */
export async function mintUniqueCode(
  batchCode: string
): Promise<MintedCode | MintFailure> {
  const code = batchCode.trim().toUpperCase();

  const { data: parent, error: parentErr } = await supabaseServer
    .from("storefront_discounts")
    .select("id, code, kind, value, min_subtotal, active, unique_codes, starts_at, ends_at")
    .eq("code", code)
    .maybeSingle();

  if (parentErr) return { error: parentErr.message, status: 500 };
  if (!parent || !parent.unique_codes) {
    return {
      error: `No unique-code batch named "${code}" — create it in FMG → Discounts (tick "Unique one-time codes").`,
      status: 404,
    };
  }

  const now = Date.now();
  const live =
    parent.active &&
    (!parent.starts_at || new Date(parent.starts_at).getTime() <= now) &&
    (!parent.ends_at || new Date(parent.ends_at).getTime() >= now);
  if (!live) {
    return { error: `the "${code}" offer is not active`, status: 409 };
  }

  // Retry only the (astronomically rare) unique collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const minted = `${parent.code}-${token()}`;
    const { error } = await supabaseServer
      .from("storefront_discount_codes")
      .insert({ discount_id: parent.id, code: minted });
    if (!error) {
      return {
        code: minted,
        discountId: parent.id as string,
        kind: parent.kind as MintedCode["kind"],
        value: Number(parent.value),
        minSubtotal: parent.min_subtotal != null ? Number(parent.min_subtotal) : null,
      };
    }
    if (error.code !== "23505") return { error: error.message, status: 500 };
  }
  return { error: "could not mint a unique code, try again", status: 409 };
}
