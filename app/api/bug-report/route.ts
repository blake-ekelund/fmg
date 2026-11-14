import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * "Report a bug" from the top-bar Help (?) menu.
 *
 * A report becomes a High-priority task on the Task List, owned by the app
 * owner (access = 'owner'), due in two days — so it lands where bugs already
 * get triaged and shows in the owner's notification bell, with no separate
 * inbox. Runs server-side with the service role so:
 *   • the reporter is taken from their verified session, never the request;
 *   • it works for every internal role, including ones that can't open the
 *     Task List themselves.
 *
 * POST { title, details?, screenshotUrl?, page, userAgent?, viewport?, brand? }
 *   → { ok: true, taskId }
 */

const MAX = { title: 140, details: 4000, page: 500, ua: 400, viewport: 40, brand: 20, url: 1000 };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** yyyy-mm-dd, n days from now, in the business's time zone. */
function dueIn(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = clip(body.title, MAX.title);
  if (!title) return NextResponse.json({ error: "Say briefly what went wrong." }, { status: 400 });
  const details = clip(body.details, MAX.details);
  const page = clip(body.page, MAX.page);
  const ua = clip(body.userAgent, MAX.ua);
  const viewport = clip(body.viewport, MAX.viewport);
  const brand = clip(body.brand, MAX.brand);
  const shot = clip(body.screenshotUrl, MAX.url);
  const screenshotUrl = /^https:\/\//i.test(shot) ? shot : "";

  // Who reported it (from the session) and who it goes to (the owner).
  const [{ data: reporter }, { data: owners }] = await Promise.all([
    supabaseServer.from("profiles").select("first_name, email").eq("id", user.id).maybeSingle(),
    supabaseServer
      .from("profiles")
      .select("first_name")
      .eq("access", "owner")
      .not("first_name", "is", null)
      .order("first_name")
      .limit(1),
  ]);
  const r = reporter as { first_name: string | null; email: string | null } | null;
  const reporterName = r?.first_name?.trim() || r?.email || user.email || "Someone";
  const owner = ((owners ?? []) as { first_name: string | null }[])[0]?.first_name?.trim() || null;

  const reportedAt = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
  const notes = [
    `Reported by ${reporterName}${r?.email ? ` (${r.email})` : ""} · ${reportedAt} CT`,
    page && `Page: ${page}`,
    brand && `Brand filter: ${brand}`,
    viewport && `Screen: ${viewport}`,
    ua && `Browser: ${ua}`,
    screenshotUrl && `Screenshot: ${screenshotUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabaseServer
    .from("tasks")
    .insert({
      name: `Bug: ${title}`,
      description: details || null,
      notes,
      owner,
      priority: "High",
      status: "todo",
      completed: false,
      due_date: dueIn(2),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, taskId: (data as { id: string }).id });
}
