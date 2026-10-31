import { NextResponse } from "next/server";
import type { UserRole } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { requireInternalUser, type AuthProfile } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeWidgets } from "./run";
import { nextRunAt, normalizeSchedule } from "./schedule";
import type { Report, Schedule } from "./types";

/* custom_reports reads/writes (service role). Reports are shared with all
   internal staff — it's a small team — but every view re-runs the queries
   under the viewer's role. Only the creator or an owner/admin edits one. */

const COLS =
  "id, owner_id, title, description, widgets, schedule, schedule_enabled, next_run_at, last_run_at, last_run_status, last_run_error, created_at, updated_at";

/** Route guard: internal staff whose role can open /reports. Returns the user or a 401/403 response. */
export async function requireReportsUser(request: Request): Promise<{ user: AuthProfile & { role: UserRole } } | { res: NextResponse }> {
  const user = await requireInternalUser(request);
  if (!user) return { res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const role = user.access as UserRole;
  if (!getAllowedPaths(role).includes("/reports")) return { res: NextResponse.json({ error: "Your account doesn't include Reports." }, { status: 403 }) };
  return { user: { ...user, role } };
}

export const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export function reportsReady(error: { message?: string; code?: string } | null): boolean {
  return !(error && (error.code === "42P01" || /custom_reports/.test(error.message ?? "")));
}

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabaseServer.from("profiles").select("id, first_name, email").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; first_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.first_name?.trim() || p.email?.split("@")[0] || "Someone",
    ]),
  );
}

export async function listReports(): Promise<{ ready: boolean; items: Report[] }> {
  const { data, error } = await supabaseServer.from("custom_reports").select(COLS).order("updated_at", { ascending: false }).limit(200);
  if (error) {
    if (!reportsReady(error)) return { ready: false, items: [] };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as Report[];
  const names = await ownerNames([...new Set(rows.map((r) => r.owner_id))]);
  return { ready: true, items: rows.map((r) => ({ ...r, owner_name: names.get(r.owner_id) ?? null })) };
}

export async function getReport(id: string): Promise<Report | null> {
  const { data, error } = await supabaseServer.from("custom_reports").select(COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(reportsReady(error) ? error.message : "Reports aren't set up yet (database migration pending).");
  if (!data) return null;
  const r = data as Report;
  const names = await ownerNames([r.owner_id]);
  return { ...r, owner_name: names.get(r.owner_id) ?? null };
}

export function canEdit(report: Pick<Report, "owner_id">, user: { id: string; access: string | null }): boolean {
  return report.owner_id === user.id || user.access === "owner" || user.access === "admin";
}

/** Team members a schedule can go to (the page's recipient picker). */
export async function teamMembers(): Promise<{ name: string; email: string }[]> {
  const { data } = await supabaseServer.from("profiles").select("first_name, email, access");
  return ((data ?? []) as { first_name: string | null; email: string | null; access: string | null }[])
    .filter((p) => p.email && p.access && p.access !== "rep")
    .map((p) => ({ name: p.first_name?.trim() || p.email!.split("@")[0], email: p.email!.trim().toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Internal staff emails — scheduled reports only ever go to these. */
export async function internalEmails(): Promise<Set<string>> {
  const { data } = await supabaseServer.from("profiles").select("email, access");
  return new Set(
    ((data ?? []) as { email: string | null; access: string | null }[])
      .filter((p) => p.email && p.access && p.access !== "rep")
      .map((p) => p.email!.trim().toLowerCase()),
  );
}

/**
 * Recipients as Sage or the page gives them — emails, team first names, or
 * "me" — → staff emails. Throws naming anyone who isn't on the team.
 */
export async function resolveRecipients(list: unknown, meId: string): Promise<string[]> {
  if (!Array.isArray(list)) return [];
  const { data } = await supabaseServer.from("profiles").select("id, first_name, email, access");
  const team = ((data ?? []) as { id: string; first_name: string | null; email: string | null; access: string | null }[]).filter(
    (p) => p.email && p.access && p.access !== "rep",
  );
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of list) {
    const v = String(raw).trim();
    const lower = v.toLowerCase();
    const hit =
      lower === "me"
        ? team.find((p) => p.id === meId)
        : lower.includes("@")
          ? team.find((p) => p.email!.toLowerCase() === lower)
          : team.find((p) => p.first_name?.trim().toLowerCase() === lower);
    if (hit) out.push(hit.email!.toLowerCase());
    else if (v) unknown.push(v);
  }
  if (unknown.length) {
    const names = team.map((p) => p.first_name?.trim()).filter(Boolean).join(", ");
    throw new Error(`Scheduled reports only go to FMG team members. Not on the team: ${unknown.join(", ")}. Team: ${names}.`);
  }
  return [...new Set(out)];
}

/** Schedule + enabled → the columns to write (validates recipients are staff). */
export async function scheduleColumns(rawSchedule: unknown, enabled: boolean) {
  if (rawSchedule === null) return { schedule: null, schedule_enabled: false, next_run_at: null };
  const schedule: Schedule = normalizeSchedule(rawSchedule);
  const staff = await internalEmails();
  const outside = schedule.recipients.filter((e) => !staff.has(e));
  if (outside.length) {
    throw new Error(`Scheduled reports can only go to FMG team members. Not on the team: ${outside.join(", ")}.`);
  }
  return { schedule, schedule_enabled: enabled, next_run_at: enabled ? nextRunAt(schedule).toISOString() : null };
}

export type ReportInput = {
  title?: unknown;
  description?: unknown;
  widgets?: unknown;
  schedule?: unknown;
  schedule_enabled?: unknown;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function createReport(ownerId: string, input: ReportInput): Promise<Report> {
  const row: Record<string, unknown> = {
    owner_id: ownerId,
    title: text(input.title, 120) || "Untitled report",
    description: text(input.description, 500) || null,
    widgets: normalizeWidgets(input.widgets ?? []),
  };
  if (input.schedule !== undefined) Object.assign(row, await scheduleColumns(input.schedule, input.schedule_enabled !== false));
  const { data, error } = await supabaseServer.from("custom_reports").insert(row).select(COLS).single();
  if (error) throw new Error(reportsReady(error) ? error.message : "Reports aren't set up yet (database migration pending).");
  return data as Report;
}

export async function updateReport(existing: Report, input: ReportInput): Promise<Report> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = text(input.title, 120) || existing.title;
  if (input.description !== undefined) patch.description = text(input.description, 500) || null;
  if (input.widgets !== undefined) patch.widgets = normalizeWidgets(input.widgets);
  if (input.schedule !== undefined) {
    Object.assign(patch, await scheduleColumns(input.schedule, input.schedule_enabled !== undefined ? input.schedule_enabled === true : true));
  } else if (input.schedule_enabled !== undefined && existing.schedule) {
    // Pause / resume without touching the schedule itself.
    const on = input.schedule_enabled === true;
    patch.schedule_enabled = on;
    patch.next_run_at = on ? nextRunAt(existing.schedule).toISOString() : null;
  }
  const { data, error } = await supabaseServer.from("custom_reports").update(patch).eq("id", existing.id).select(COLS).single();
  if (error) throw new Error(error.message);
  return { ...(data as Report), owner_name: existing.owner_name };
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabaseServer.from("custom_reports").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
