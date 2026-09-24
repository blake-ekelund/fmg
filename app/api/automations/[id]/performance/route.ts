import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireInternalUser } from "@/lib/email/server-auth";
import type { EmailBlock } from "@/components/templates/types";
import { attributeOrders } from "@/lib/automations/attribution";

export const runtime = "nodejs";

/** Storefront (D2C) Fishbowl customer ids — same set the sales views use. */
const D2C_CUSTOMER_IDS = ["12345", "12483", "13704"];
const CHUNK = 200;
const DEFAULT_ATTRIBUTION_DAYS = 7;

/**
 * GET /api/automations/<id>/performance
 *
 * Everything the automation Overview needs in one call: each step's email
 * (subject, preview text, any offer it carries) with its real results —
 * delivered, opened, clicked, and orders/revenue attributed to it.
 *
 * Attribution (last touch, within this automation): an order from an enrolled
 * customer counts toward the most recent email this automation sent them, if
 * the order landed within `trigger_config.attribution_days` (default 7) after
 * it. Orders come from Fishbowl (sales_orders_current) — the same source the
 * triggers use — dated by datecompleted, which trails the order by the
 * fulfilment lag; the default window is sized to absorb that.
 *
 * Test-batch enrollments are excluded: their mail went to a tester.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data: automation } = await supabaseServer
    .from("automations")
    .select("id, trigger_config")
    .eq("id", id)
    .maybeSingle();
  if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const cfg = (automation.trigger_config ?? {}) as Record<string, unknown>;
  const windowDays = Number(cfg.attribution_days) > 0 ? Number(cfg.attribution_days) : DEFAULT_ATTRIBUTION_DAYS;

  /* 1. Steps + their templates. */
  const { data: stepRows } = await supabaseServer
    .from("automation_steps")
    .select("id, step_order, template_id, delay_days, send_date")
    .eq("automation_id", id)
    .order("step_order", { ascending: true });
  type StepRow = { id: string; step_order: number; template_id: string | null; delay_days: number; send_date: string | null };
  const steps = (stepRows as StepRow[] | null) ?? [];
  const tplIds = steps.map((s) => s.template_id).filter((t): t is string => !!t);
  const { data: tplRows } = tplIds.length
    ? await supabaseServer
        .from("email_templates")
        .select("id, name, subject, preview_text, source, blocks")
        .in("id", tplIds)
    : { data: [] };
  type TplRow = { id: string; name: string; subject: string | null; preview_text: string | null; source: string; blocks: unknown };
  const templates = new Map(((tplRows as TplRow[] | null) ?? []).map((t) => [t.id, t]));

  /* 2. Real (non-test) enrollments and their sends. */
  type Enr = { id: string; customer_type: string; customer_ref: string };
  const enrollments: Enr[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseServer
      .from("automation_enrollments")
      .select("id, customer_type, customer_ref")
      .eq("automation_id", id)
      .eq("is_test", false)
      .order("id", { ascending: true })
      .range(from, from + 999);
    const rows = (data as Enr[] | null) ?? [];
    enrollments.push(...rows);
    if (rows.length < 1000) break;
  }
  const enrById = new Map(enrollments.map((e) => [e.id, e]));

  type Send = { enrollment_id: string; step_order: number; message_id: string | null; sent_at: string };
  const sends: Send[] = [];
  const enrIds = enrollments.map((e) => e.id);
  for (let i = 0; i < enrIds.length; i += CHUNK) {
    const { data } = await supabaseServer
      .from("automation_step_sends")
      .select("enrollment_id, step_order, message_id, sent_at")
      .in("enrollment_id", enrIds.slice(i, i + CHUNK))
      .eq("status", "sent");
    sends.push(...(((data as Send[] | null) ?? [])));
  }

  /* 3. Opens + clicks (trigger-maintained counters on the message rows). */
  const messageIds = sends.map((s) => s.message_id).filter((m): m is string => !!m);
  const opened = new Set<string>();
  const clicked = new Set<string>();
  for (let i = 0; i < messageIds.length; i += CHUNK) {
    const slice = messageIds.slice(i, i + CHUNK);
    const [{ data: o }, { data: c }] = await Promise.all([
      supabaseServer.from("email_messages").select("id").in("id", slice).gt("open_count", 0),
      supabaseServer.from("email_message_links").select("message_id").in("message_id", slice).gt("click_count", 0),
    ]);
    for (const m of ((o as Array<{ id: string }> | null) ?? [])) opened.add(m.id);
    for (const l of ((c as Array<{ message_id: string }> | null) ?? [])) clicked.add(l.message_id);
  }

  /* 4. Orders from the enrolled customers since the first send. */
  const firstSend = sends.reduce<string | null>((min, s) => (!min || s.sent_at < min ? s.sent_at : min), null);
  type Order = { key: string; date: string; total: number };
  const orders: Order[] = [];
  if (firstSend) {
    const since = firstSend.slice(0, 10);
    const d2cRefs = new Set(enrollments.filter((e) => e.customer_type === "d2c").map((e) => e.customer_ref));
    const wsRefs = [...new Set(enrollments.filter((e) => e.customer_type === "wholesale").map((e) => e.customer_ref))];

    if (d2cRefs.size) {
      for (let from = 0; ; from += 1000) {
        const { data } = await supabaseServer
          .from("sales_orders_current")
          .select("id, email, datecompleted, totalprice")
          .in("customerid", D2C_CUSTOMER_IDS)
          .gte("datecompleted", since)
          .order("id", { ascending: true })
          .range(from, from + 999);
        const rows = (data as Array<{ email: string | null; datecompleted: string; totalprice: number | null }> | null) ?? [];
        for (const r of rows) {
          const key = (r.email ?? "").trim().toLowerCase();
          if (d2cRefs.has(key)) orders.push({ key: `d2c:${key}`, date: r.datecompleted, total: Number(r.totalprice) || 0 });
        }
        if (rows.length < 1000) break;
      }
    }
    for (let i = 0; i < wsRefs.length; i += CHUNK) {
      // Paged with a stable order: an unordered read silently caps at 1,000.
      for (let from = 0; ; from += 1000) {
        const { data } = await supabaseServer
          .from("sales_orders_current")
          .select("id, customerid, datecompleted, totalprice")
          .in("customerid", wsRefs.slice(i, i + CHUNK))
          .gte("datecompleted", since)
          .order("id", { ascending: true })
          .range(from, from + 999);
        const rows = (data as Array<{ customerid: string; datecompleted: string; totalprice: number | null }> | null) ?? [];
        for (const r of rows) {
          orders.push({ key: `wholesale:${r.customerid}`, date: r.datecompleted, total: Number(r.totalprice) || 0 });
        }
        if (rows.length < 1000) break;
      }
    }
  }

  /* 5. Attribute each order to the customer's latest send before it, in window. */
  const attributed = attributeOrders(
    sends.flatMap((s) => {
      const e = enrById.get(s.enrollment_id);
      return e ? [{ customerKey: `${e.customer_type}:${e.customer_ref}`, stepOrder: s.step_order, sentAt: s.sent_at }] : [];
    }),
    orders.map((o) => ({ customerKey: o.key, date: o.date, total: o.total })),
    windowDays,
  );

  /* 6. Per-step roll-up. */
  const perStep = steps.map((s) => {
    const tpl = s.template_id ? templates.get(s.template_id) : undefined;
    const mine = sends.filter((x) => x.step_order === s.step_order);
    const att = attributed.get(s.step_order) ?? { orders: 0, revenue: 0 };
    return {
      step_order: s.step_order,
      delay_days: s.delay_days,
      send_date: s.send_date,
      template: tpl
        ? {
            id: tpl.id,
            name: tpl.name,
            subject: tpl.subject,
            preview_text: tpl.preview_text,
            offer: offerOf(tpl.blocks),
          }
        : null,
      delivered: mine.length,
      opened: mine.filter((x) => x.message_id && opened.has(x.message_id)).length,
      clicked: mine.filter((x) => x.message_id && clicked.has(x.message_id)).length,
      orders: att.orders,
      revenue: Math.round(att.revenue * 100) / 100,
    };
  });

  return NextResponse.json({
    attribution_days: windowDays,
    enrolled: enrollments.length,
    steps: perStep,
  });
}

/**
 * The offer an email carries, read from its promotion blocks: the badge label
 * ("15% OFF") and the code, reported as "unique" when it's a per-recipient
 * {{discountCode:BATCH}} token.
 */
function offerOf(blocks: unknown): { label: string; code: string; unique: boolean } | null {
  const walk = (list: unknown): EmailBlock[] =>
    Array.isArray(list)
      ? (list as EmailBlock[]).flatMap((b) =>
          b?.type === "section" ? b.columns.flatMap((c) => walk(c.blocks)) : [b],
        )
      : [];
  for (const b of walk(blocks)) {
    if (b.type !== "promotion") continue;
    const token = /\{\{\s*discountCode\s*:\s*([A-Za-z0-9_-]+)\s*\}\}/.exec(b.promoCode ?? "");
    return {
      label: b.discountLabel || b.headline || "Offer",
      code: token ? token[1].toUpperCase() : (b.promoCode ?? ""),
      unique: !!token,
    };
  }
  return null;
}
