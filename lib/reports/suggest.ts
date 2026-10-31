import Anthropic from "@anthropic-ai/sdk";
import type { UserRole } from "@/components/UserContext";
import { datasetsForRole, describeDatasets } from "@/lib/assistant/dataCatalog";
import { widgetSchema } from "@/lib/assistant/helpTools";
import { normalizeWidgets, runReport } from "./run";
import type { Widget } from "./types";

/* "Sage recommends" on a report page: Claude looks at what the report already
   shows and proposes a few widgets worth adding, each with a one-line reason.
   Every suggestion is test-run under the viewer's role and dropped if it
   errors or comes back empty — so "Add" always adds something that works. */

const MODEL = "claude-opus-5-5";

export type Suggestion = { why: string; widget: Widget };

function describeWidgets(widgets: Widget[]): string {
  if (!widgets.length) return "(empty — nothing yet)";
  return widgets
    .map((w) => `- [${w.type}${w.chart ? `/${w.chart}` : ""}] "${w.title}": ${JSON.stringify(w.query)}${w.compare_query ? " (with comparison)" : ""}`)
    .join("\n");
}

export async function suggestWidgets(report: { title: string; description: string | null; widgets: Widget[] }, role: UserRole): Promise<Suggestion[]> {
  const datasets = datasetsForRole(role);
  if (!datasets.length) return [];
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Chicago" });
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: `You are Sage, the analyst inside the FMG portal (Fragrance Marketing Group: Natural Inspirations and Sassy brands, wholesale + D2C). You recommend additions to a small team's saved report. Today is ${today}.

Recommend 3 or 4 widgets that would make THIS report more useful for running the business — the gaps a sharp analyst would notice: a missing comparison to the prior period, a trend behind a headline number, a breakdown that explains it (brand, channel, product, customer, state), a top/bottom list to act on, an exception list (e.g. orders not yet in Fishbowl, low stock). Fit the report's topic; don't repeat what's there. Use relative dates (@start_of_month, @today-30d …), never fixed dates. Fishbowl revenue = sales_by_product_month with typename "Sale". Each "why" is one plain sentence for a busy owner (≤ 20 words).

Data you can use:
${describeDatasets(datasets)}`,
    tools: [
      {
        name: "suggest_widgets",
        description: "Return the recommended widgets.",
        input_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: { why: { type: "string" }, widget: widgetSchema(datasets) },
                required: ["why", "widget"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "suggest_widgets" },
    messages: [
      {
        role: "user",
        content: `Report: "${report.title}"${report.description ? ` — ${report.description}` : ""}\nCurrent widgets:\n${describeWidgets(report.widgets)}`,
      },
    ],
  });

  const call = res.content.find((b) => b.type === "tool_use");
  const raw = ((call?.type === "tool_use" ? call.input : {}) as { suggestions?: { why?: unknown; widget?: unknown }[] }).suggestions ?? [];
  const candidates: Suggestion[] = [];
  for (const s of raw.slice(0, 5)) {
    try {
      const [widget] = normalizeWidgets([s.widget]);
      candidates.push({ why: String(s.why ?? "").slice(0, 200), widget });
    } catch {
      // A malformed suggestion is just skipped.
    }
  }
  const results = await runReport(
    candidates.map((c) => c.widget),
    role,
    5,
  );
  return candidates.filter((c, i) => {
    const r = results[i];
    return r.ok && (c.widget.type === "kpi" ? r.value != null : r.rows.length > 0);
  });
}
