import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { isMintFailure, mintUniqueCode } from "@/lib/storefrontDiscountCodes";
import { normalizePersonalityTags } from "@/lib/storefrontFeedback";

export const runtime = "nodejs";

/**
 * Storefront SITE feedback in exchange for a reward code.
 *
 *   POST — called by a storefront cart with STOREFRONT_NOTIFY_SECRET. Records
 *          the review and returns a personal single-use code minted from a
 *          unique-code batch, which the cart applies immediately.
 *   GET  — the FMG portal page (Storefronts → Site Feedback). Internal only.
 *
 * This is pre-purchase: the shopper is reviewing the storefront, not a product
 * they haven't received. See the migration for why that distinction matters.
 *
 * The reward is entirely defined by the batch: point FEEDBACK_BATCH at a
 * "free shipping"-sized fixed code today and a bigger one next quarter without
 * touching either codebase.
 */

const DEFAULT_BATCH = "THANKS";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A written answer has to clear this to count as an answer at all. */
const MIN_ANSWER = 10;
const MAX_ANSWER = 2000;

type PostBody = {
  store?: string;
  uxRating?: number | null;
  personalityTags?: unknown;
  personality?: string | null;
  hadIssues?: boolean | null;
  issues?: string | null;
  recommendations?: string | null;
  name?: string | null;
  email?: string;
  consentPublish?: boolean;
  source?: string | null;
  batchCode?: string;
};

/** Trim + cap a written answer, or null if it's effectively blank. */
function answer(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, MAX_ANSWER) : null;
}

function short(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function tableMissing(message: string): boolean {
  return /schema cache|does not exist/i.test(message);
}

const MIGRATION_HINT =
  "the storefront_feedback table is missing — run supabase/migrations/20260723060000_storefront_feedback.sql";

export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_NOTIFY_SECRET;
  const authz = request.headers.get("authorization") ?? "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const b = (await request.json().catch(() => ({}))) as PostBody;

  const store = String(b.store ?? "sassy").toLowerCase();
  if (store !== "sassy" && store !== "ni") {
    return NextResponse.json({ error: "unknown store" }, { status: 400 });
  }

  const email = String(b.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "a valid email is required" }, { status: 400 });
  }

  const ratingRaw = Number(b.uxRating);
  const uxRating =
    Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

  const personality = answer(b.personality);
  const issues = answer(b.issues);
  const recommendations = answer(b.recommendations);
  const personalityTags = normalizePersonalityTags(b.personalityTags);
  const hadIssues = typeof b.hadIssues === "boolean" ? b.hadIssues : null;

  // We're paying for this, so it has to actually say something. A rating alone
  // is one click and tells us nothing we can act on; the bar is a rating (or a
  // tag) PLUS at least one written answer of real length.
  const written = [personality, issues, recommendations].filter(
    (v) => v && v.length >= MIN_ANSWER
  );
  if (written.length === 0) {
    return NextResponse.json(
      { error: "please answer at least one of the questions in a sentence or two" },
      { status: 400 }
    );
  }
  if (uxRating === null && personalityTags.length === 0) {
    return NextResponse.json(
      { error: "please rate the experience before submitting" },
      { status: 400 }
    );
  }

  // One reward per email per store. Checked here for a friendly message; the
  // partial unique index in the migration is what actually holds under a
  // double-submit. If their earlier code is still unspent, hand back the same
  // one rather than refusing — a shopper who lost the code isn't a cheater.
  const { data: prior, error: priorErr } = await supabaseServer
    .from("storefront_feedback")
    .select("id, code")
    .eq("store", store)
    // eq, not ilike — `_` is legal in an email and a wildcard in ilike, which
    // would let one address claim another's slot. We always store lowercase.
    .eq("email", email)
    .maybeSingle();

  if (priorErr) {
    return NextResponse.json(
      { error: tableMissing(priorErr.message) ? MIGRATION_HINT : priorErr.message },
      { status: 500 }
    );
  }

  if (prior?.code) {
    const { data: still } = await supabaseServer
      .from("storefront_active_unique_codes")
      .select("code, kind, value, min_subtotal")
      .eq("code", prior.code)
      .maybeSingle();
    if (still) {
      return NextResponse.json({
        code: still.code,
        kind: still.kind,
        value: Number(still.value),
        minSubtotal: still.min_subtotal != null ? Number(still.min_subtotal) : null,
        reissued: true,
      });
    }
    return NextResponse.json(
      { error: "you've already claimed this offer — thanks again for the feedback!" },
      { status: 409 }
    );
  }
  if (prior) {
    // A row exists but never got a code (a past mint failure that lost its
    // cleanup). Don't strand them — drop the orphan and continue.
    await supabaseServer.from("storefront_feedback").delete().eq("id", prior.id);
  }

  // Claim the slot BEFORE minting so two submits can't each earn a code, then
  // mint. If minting fails, release the row so they can try again later —
  // feedback we can't pay for isn't feedback we should keep.
  const { data: inserted, error: insertErr } = await supabaseServer
    .from("storefront_feedback")
    .insert({
      store,
      ux_rating: uxRating,
      personality_tags: personalityTags,
      personality,
      had_issues: hadIssues,
      issues,
      recommendations,
      name: short(b.name),
      email,
      consent_publish: b.consentPublish === true,
      source: short(b.source, 40) ?? "cart",
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "you've already claimed this offer — thanks again for the feedback!" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: tableMissing(insertErr.message) ? MIGRATION_HINT : insertErr.message },
      { status: 500 }
    );
  }

  const batch = String(b.batchCode ?? process.env.FEEDBACK_BATCH ?? DEFAULT_BATCH);
  const minted = await mintUniqueCode(batch);
  if (isMintFailure(minted)) {
    await supabaseServer.from("storefront_feedback").delete().eq("id", inserted.id);
    return NextResponse.json({ error: minted.error }, { status: minted.status });
  }

  await supabaseServer
    .from("storefront_feedback")
    .update({ code: minted.code, discount_id: minted.discountId })
    .eq("id", inserted.id);

  return NextResponse.json({
    code: minted.code,
    kind: minted.kind,
    value: minted.value,
    minSubtotal: minted.minSubtotal,
  });
}

/** The portal list. Latest 200 — plenty at current volume, filtered client-side. */
export async function GET(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("storefront_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (tableMissing(error.message)) {
      return NextResponse.json({ feedback: [], notReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Which reward codes actually got spent, so the page can show conversion
  // rather than just submissions.
  const codes = (data ?? []).map((r) => r.code).filter(Boolean) as string[];
  const redeemed: Record<string, string> = {};
  if (codes.length) {
    const { data: rows } = await supabaseServer
      .from("storefront_discount_codes")
      .select("code, redeemed_at, order_id")
      .in("code", codes)
      .not("redeemed_at", "is", null);
    for (const r of rows ?? []) redeemed[r.code as string] = String(r.order_id ?? "");
  }

  return NextResponse.json({ feedback: data ?? [], redeemed, notReady: false });
}
