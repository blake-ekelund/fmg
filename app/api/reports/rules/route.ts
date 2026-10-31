import { NextResponse } from "next/server";
import { addTeamRule, listTeamRules, removeTeamRule, requireReportsUser } from "@/lib/reports/store";

export const runtime = "nodejs";

/**
 * Team rules Sage follows when building reports (lib/reports/rules.ts).
 * GET    /api/reports/rules            — { ready, rules }
 * POST   /api/reports/rules  { text }  — add one (any Reports user)
 * DELETE /api/reports/rules?id=…       — its author or an owner/admin
 */
export async function GET(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  return NextResponse.json({ ...(await listTeamRules()), me: auth.user.id, admin: auth.user.role === "owner" || auth.user.role === "admin" });
}

export async function POST(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  try {
    return NextResponse.json({ rule: await addTeamRule(String(body.text ?? ""), auth.user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save the rule." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireReportsUser(request);
  if ("res" in auth) return auth.res;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const ok = await removeTeamRule(id, auth.user);
  if (!ok) return NextResponse.json({ error: "Only the rule's author or an admin can remove it." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
