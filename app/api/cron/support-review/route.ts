import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/support-review, hourly.
 *
 * Most storefront chats never end with "thanks, bye". The customer gets their
 * answer and closes the tab, and the ticket would otherwise sit in "AI is
 * handling" forever. Once an AI-handled chat has been quiet for 12 hours (the
 * storefront has long since rolled that customer onto a fresh ticket), Claude
 * reads the transcript and decides what it was:
 *
 *   resolved        → Issue handled, by the AI, with a one-line outcome
 *   abandoned       → Issue handled, automatically (they left with nothing
 *                     outstanding worth chasing)
 *   needs_follow_up → Sent to a human (an unanswered complaint, a problem
 *                     with an order, a question the bot couldn't answer).
 *                     That puts it in everyone's bell and toasts the team.
 *
 * Resolved/abandoned chats get resolved_at = their last message, so they go
 * straight to the Archive: the customer has already been silent for 12h.
 * Needs migration 20261114050000 (resolution columns); before it, a no-op.
 * Cron (CRON_SECRET) or internal staff by hand.
 */

const MODEL = "claude-opus-5-5";
const IDLE_MS = 12 * 60 * 60_000;
const PER_RUN = 25;

const SYSTEM = `You review finished customer-service chats from two small personal-care brands' online stores (Sassy + Co, Natural Inspirations). An AI concierge handled each chat, and the customer has now been silent for over 12 hours. Decide the outcome:
- "resolved": the customer got what they came for (question answered, product found, order status given), whether or not they said thanks.
- "abandoned": the customer left before anything substantive was asked, or drifted off mid-browse with nothing anyone needs to follow up on.
- "needs_follow_up": a real person should reach out. Examples: a complaint, a damaged/wrong/missing item, a refund or order problem, a question the concierge could not answer or got wrong, an upset customer.
Be conservative: if a customer reported a problem and it was not clearly fixed, choose "needs_follow_up".
summary: one short line for the team, past tense, no customer PII beyond what's needed (e.g. "Answered shipping time to Canada", "Left after asking about ingredients", "Reported a leaking tube, no resolution").`;

const SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["resolved", "abandoned", "needs_follow_up"] },
    summary: { type: "string" },
  },
  required: ["outcome", "summary"],
  additionalProperties: false,
} as const;

type Verdict = { outcome: "resolved" | "abandoned" | "needs_follow_up"; summary: string };

let client: Anthropic | null = null;

async function judge(transcript: string): Promise<Verdict | null> {
  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: transcript }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    const v = JSON.parse(text.text) as Verdict;
    return ["resolved", "abandoned", "needs_follow_up"].includes(v.outcome) ? v : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && (request.headers.get("authorization") ?? "") === `Bearer ${cronSecret}`;
  if (!isCron && !(await requireInternalUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  }

  // Selecting resolved_at doubles as the migration check.
  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  const { data: convos, error } = await supabaseServer
    .from("support_conversations")
    .select("id, store, last_message_at, resolved_at")
    .eq("status", "bot")
    .lt("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(PER_RUN);
  if (error) {
    return NextResponse.json({ skipped: true, reason: error.message });
  }

  const tally = { resolved: 0, abandoned: 0, needs_follow_up: 0, skipped: 0 };
  for (const c of (convos ?? []) as { id: string; store: string; last_message_at: string }[]) {
    const { data: msgs } = await supabaseServer
      .from("support_messages")
      .select("role, content")
      .eq("conversation_id", c.id)
      .in("role", ["user", "assistant", "agent"])
      .order("seq", { ascending: true })
      .limit(60);
    const lines = (msgs ?? []).map(
      (m) =>
        `${m.role === "user" ? "Customer" : m.role === "agent" ? "Team" : "Concierge"}: ${String(m.content).slice(0, 1500)}`,
    );

    let verdict: Verdict | null;
    if (!lines.some((l) => l.startsWith("Customer:"))) {
      verdict = { outcome: "abandoned", summary: "Opened the chat but never wrote" };
    } else {
      try {
        verdict = await judge(`Store: ${c.store === "ni" ? "Natural Inspirations" : "Sassy + Co"}\n\n${lines.join("\n\n")}`);
      } catch {
        verdict = null;
      }
    }
    if (!verdict) {
      tally.skipped += 1;
      continue;
    }

    const summary = verdict.summary.trim().slice(0, 300);
    if (verdict.outcome === "needs_follow_up") {
      // Guarded on status so a person who took it meanwhile isn't overridden.
      await supabaseServer
        .from("support_conversations")
        .update({ status: "needs_human", agent_unread: true })
        .eq("id", c.id)
        .eq("status", "bot");
      await supabaseServer.from("support_messages").insert({
        conversation_id: c.id,
        role: "system",
        content: `AI review: needs follow-up. ${summary}`,
      });
    } else {
      await supabaseServer
        .from("support_conversations")
        .update({
          status: "closed",
          resolved_at: c.last_message_at,
          resolved_by: verdict.outcome === "resolved" ? "ai" : "auto",
          resolution: summary,
        })
        .eq("id", c.id)
        .eq("status", "bot");
      await supabaseServer.from("support_messages").insert({
        conversation_id: c.id,
        role: "system",
        content: `AI review: ${verdict.outcome === "resolved" ? "resolved" : "customer left"}. ${summary}`,
      });
    }
    tally[verdict.outcome] += 1;
  }

  return NextResponse.json({ reviewed: (convos ?? []).length, ...tally });
}
