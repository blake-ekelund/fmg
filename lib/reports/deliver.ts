import type { UserRole } from "@/components/UserContext";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveSender } from "@/lib/email/sender";
import { sendResendEmail } from "@/lib/email/resend";
import { bulkSendOrigin } from "@/lib/email/bulkSend";
import { buildReportWorkbook, reportFilename } from "./excel";
import { runReport } from "./run";
import { describeSchedule, nextRunAt } from "./schedule";
import { chartData, formatCell, formatOf, formatValue, kpiDelta, labelFor, pivotize } from "./shape";
import { internalEmails } from "./store";
import type { Report, Widget, WidgetResult } from "./types";

/* Scheduled report emails. The report runs under its OWNER's role (the person
   who set the schedule decides what's in it), goes only to internal staff,
   and carries a compact HTML version (KPI tiles, bar lists, top rows) plus the
   full numbers as an Excel attachment. Charts become simple HTML bar lists —
   mail clients strip SVG/canvas, and these read fine in Outlook and Gmail. */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"));

const NAVY = "#1B3C53";
const MUTED = "#6B7B88";
const LINE = "#E3E9EF";
const ROWS = 12;

function kpiTiles(widgets: Widget[], byId: Map<string, WidgetResult>): string {
  if (!widgets.length) return "";
  const cells = widgets.map((w) => {
    const r = byId.get(w.id);
    const value = r?.ok ? formatValue(r.value, formatOf(w)) : "—";
    const d = r?.ok ? kpiDelta(r.value, r.compare) : null;
    const delta =
      d == null
        ? ""
        : `<div style="font-size:12px;color:${d >= 0 ? "#12805C" : "#C0342C"};padding-top:4px">${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(1)}% <span style="color:${MUTED}">${esc(w.compare_label ?? "")}</span></div>`;
    return `<td width="50%" valign="top" style="padding:6px"><div style="border:1px solid ${LINE};border-radius:10px;padding:14px 16px">
<div style="font-size:12px;color:${MUTED}">${esc(w.title)}</div>
<div style="font-size:22px;font-weight:700;color:${NAVY};padding-top:4px">${esc(value)}</div>${delta}</div></td>`;
  });
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td width="50%"></td>'}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px">${rows.join("")}</table>`;
}

function table(head: string[], body: string[][], boldLast = false): string {
  const th = head.map((h, i) => `<th align="${i ? "right" : "left"}" style="padding:6px 8px;font-size:11px;color:${MUTED};font-weight:600;border-bottom:1px solid ${LINE}">${esc(h)}</th>`).join("");
  const tr = body
    .map(
      (r, ri) =>
        `<tr>${r
          .map(
            (c, i) =>
              `<td align="${i ? "right" : "left"}" style="padding:6px 8px;font-size:12px;border-bottom:1px solid ${LINE};${boldLast && ri === body.length - 1 ? "font-weight:700;" : ""}">${esc(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${th}</tr>${tr}</table>`;
}

function barList(items: { label: string; value: number; shown: string }[], color: string): string {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
    .map((i) => {
      const pct = Math.max(1, Math.round((Math.abs(i.value) / max) * 100));
      return `<tr><td width="32%" style="padding:4px 8px 4px 0;font-size:12px;color:#3C4D5A">${esc(i.label)}</td>
<td style="padding:4px 0"><table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td style="background:${color};height:12px;border-radius:3px;font-size:1px;line-height:12px">&nbsp;</td></tr></table></td>
<td width="18%" align="right" style="padding:4px 0 4px 8px;font-size:12px;font-weight:600;color:${NAVY}">${esc(i.shown)}</td></tr>`;
    })
    .join("")}</table>`;
}

function widgetBlock(w: Widget, r: WidgetResult | undefined): string {
  const head = `<div style="font-size:15px;font-weight:700;color:${NAVY}">${esc(w.title)}</div>${
    w.note ? `<div style="font-size:12px;color:${MUTED};padding-top:2px">${esc(w.note)}</div>` : ""
  }`;
  let body: string;
  if (!r) body = `<div style="font-size:12px;color:${MUTED}">Not run.</div>`;
  else if (!r.ok) body = `<div style="font-size:12px;color:#C0342C">Couldn't load: ${esc(r.error)}</div>`;
  else if (!r.rows.length) body = `<div style="font-size:12px;color:${MUTED}">No data for this period.</div>`;
  else if (w.type === "chart") {
    const c = chartData(w, r);
    if (c.series.length === 1) {
      const f = formatOf(w, c.series[0].key);
      const pts = c.points.slice(-ROWS * 2);
      body = barList(pts.map((p) => ({ label: String(p.x), value: Number(p[c.series[0].key]) || 0, shown: formatValue(p[c.series[0].key], f, true) })), c.series[0].color);
    } else {
      const f = formatOf(w);
      const series = c.series.slice(0, 5);
      body = table(
        [labelFor(c.xKey, w), ...series.map((s) => s.label)],
        c.points.slice(-ROWS).map((p) => [String(p.x), ...series.map((s) => formatValue(p[s.key], f, true))]),
      );
    }
  } else if (w.type === "pivot") {
    const p = pivotize(w, r, 6);
    const f = formatOf(w, p.valueKey);
    const rows = p.rowLabels.slice(0, ROWS).map((rk, i) => [
      formatCell(rk === "—" ? null : rk, p.rowKey, w),
      ...p.cells[i].map((v) => formatValue(v, f, true)),
      formatValue(p.rowTotals[i], f, true),
    ]);
    rows.push(["Total", ...p.colTotals.map((v) => formatValue(v, f, true)), formatValue(p.grand, f, true)]);
    body = table([labelFor(p.rowKey, w), ...p.colLabels.map((c) => formatCell(c === "—" ? null : c, p.colKey, w)), "Total"], rows, true);
  } else {
    const cols = r.columns.slice(0, 5);
    body =
      table(
        cols.map((c) => labelFor(c, w)),
        r.rows.slice(0, ROWS).map((row) => cols.map((c) => formatCell(row[c], c, w))),
      ) +
      (r.rows.length > ROWS
        ? `<div style="font-size:11px;color:${MUTED};padding-top:6px">Showing ${ROWS} of ${(w.query.group_by?.length || w.query.metrics?.length ? r.rows.length : Math.max(r.total, r.rows.length)).toLocaleString()} rows — full list in the attachment.</div>`
        : "");
  }
  return `<tr><td style="padding:22px 28px 0">${head}<div style="padding-top:10px">${body}</div></td></tr>`;
}

export function renderReportEmail(report: Report, results: WidgetResult[], origin: string): { subject: string; html: string } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  const kpis = report.widgets.filter((w) => w.type === "kpi");
  const rest = report.widgets.filter((w) => w.type !== "kpi");
  const link = `${origin}/reports/${report.id}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F9FB;font-family:Helvetica,Arial,sans-serif;color:#0F1C26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FB"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;border:1px solid ${LINE}">
<tr><td style="padding:26px 28px 0"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">FMG report · ${esc(today)}</div>
<div style="font-size:22px;font-weight:700;color:${NAVY};padding-top:6px">${esc(report.title)}</div>
${report.description ? `<div style="font-size:13px;color:#3C4D5A;padding-top:4px">${esc(report.description)}</div>` : ""}</td></tr>
${kpis.length ? `<tr><td style="padding:16px 28px 0">${kpiTiles(kpis, byId)}</td></tr>` : ""}
${rest.map((w) => widgetBlock(w, byId.get(w.id))).join("\n")}
<tr><td style="padding:26px 28px 28px"><a href="${esc(link)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;font-size:13px;font-weight:600;padding:11px 20px;border-radius:8px">Open the live report</a></td></tr>
</table>
<p style="max-width:640px;margin:14px auto 0;font-size:11px;line-height:1.6;color:${MUTED}">${
    report.schedule ? `${esc(describeSchedule(report.schedule))}. ` : ""
  }You're getting this because you're on this report's schedule in the FMG portal. Change or pause it on the report's page.</p>
</td></tr></table></body></html>`;
  return { subject: `${report.title} — ${today}`, html };
}

async function ownerRole(ownerId: string): Promise<UserRole | null> {
  const { data } = await supabaseServer.from("profiles").select("access").eq("id", ownerId).maybeSingle();
  const access = (data as { access: string | null } | null)?.access ?? null;
  return access && access !== "rep" ? (access as UserRole) : null;
}

/** Build + send one report email. `to` overrides the schedule's recipients ("send me a copy now"). */
export async function deliverReport(report: Report, opts: { to?: string[]; role?: UserRole } = {}): Promise<{ sent: number; to: string[] }> {
  const role = opts.role ?? (await ownerRole(report.owner_id));
  if (!role) throw new Error("The report's owner no longer has staff access.");
  const staff = await internalEmails();
  const to = (opts.to ?? report.schedule?.recipients ?? []).map((e) => e.trim().toLowerCase()).filter((e) => staff.has(e));
  if (!to.length) throw new Error("No FMG team recipients to send to.");

  const results = await runReport(report.widgets, role, 5000);
  const { subject, html } = renderReportEmail(report, results, bulkSendOrigin());
  const attach = report.schedule?.attach_excel !== false;
  const attachments = attach
    ? [{ filename: reportFilename(report.title), content: Buffer.from(await buildReportWorkbook(report, results)).toString("base64") }]
    : undefined;
  const sender = resolveSender({ fromName: "FMG Reports" });
  await sendResendEmail({ from: sender.from, replyTo: sender.replyTo, to, subject, html, attachments });
  return { sent: to.length, to };
}

/** Cron: send every report whose time has come. Claims each with a compare-and-set on next_run_at. */
export async function runDueReports(deadlineMs = 240_000): Promise<{ due: number; sent: number; failed: number }> {
  const started = Date.now();
  const now = new Date();
  const { data, error } = await supabaseServer
    .from("custom_reports")
    .select("*")
    .eq("schedule_enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(50);
  if (error) {
    if (/custom_reports/.test(error.message) || error.code === "42P01") return { due: 0, sent: 0, failed: 0 };
    throw new Error(error.message);
  }
  const due = (data ?? []) as Report[];
  let sent = 0;
  let failed = 0;
  for (const report of due) {
    if (Date.now() - started > deadlineMs) break;
    if (!report.schedule) continue;
    const next = nextRunAt(report.schedule, now).toISOString();
    // Claim: only the run that moves next_run_at forward gets to send.
    const { data: claimed } = await supabaseServer
      .from("custom_reports")
      .update({ next_run_at: next })
      .eq("id", report.id)
      .eq("next_run_at", report.next_run_at!)
      .select("id");
    if (!claimed?.length) continue;
    try {
      await deliverReport(report);
      sent++;
      await supabaseServer
        .from("custom_reports")
        .update({ last_run_at: new Date().toISOString(), last_run_status: "sent", last_run_error: null })
        .eq("id", report.id);
    } catch (e) {
      failed++;
      console.error("[reports cron]", report.id, e);
      await supabaseServer
        .from("custom_reports")
        .update({ last_run_at: new Date().toISOString(), last_run_status: "failed", last_run_error: e instanceof Error ? e.message.slice(0, 500) : String(e) })
        .eq("id", report.id);
    }
  }
  return { due: due.length, sent, failed };
}
