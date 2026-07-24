import Anthropic from "@anthropic-ai/sdk";
import { buildPortalTools } from "./portalTools";

/**
 * The Rep Portal assistant: a Claude tool-use loop that answers a rep's
 * questions about THEIR OWN agency — sales, customers, and orders — using the
 * agency-scoped read-only tools in ./portalTools. Called by
 * /api/portal/assistant once the agency has been resolved from the session.
 *
 * Distinct from lib/assistant/agent.ts (the internal Slack bot): this one is
 * rep-facing, carries a conversation, formats for the web (standard Markdown,
 * not Slack mrkdwn), and can only ever see the one agency it was built for.
 *
 * Env: ANTHROPIC_API_KEY (server-only).
 */

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 6;

export function portalAssistantConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

const SYSTEM_PROMPT = `You are the FMG Rep Assistant, helping an independent sales rep inside the Fragrance Marketing Group (FMG) rep portal.

FMG is a fragrance and personal-care company whose brands (Sassy and Natural Inspirations) are sold wholesale to retailers through independent sales agencies. The rep you're talking to represents ONE agency, and every tool you have is already scoped to that agency — you can only see their own customers, orders, and sales. You never have access to any other agency's data, so don't offer to compare against other agencies or the whole company.

Use your tools whenever a question depends on live data:
- Call a tool for any question about the rep's sales, customers, or orders — never answer those from memory or invented figures.
- Reps name accounts loosely — often a store plus a city, like "Lunds Wayzata" or "Lunds at Minnetonka". Pass the whole phrase to the tools: they match word-by-word across the account name AND its ship-to locations, so the city helps rather than hurts. Don't strip it out or give up on a near-miss — try the tool first.
- Tracking: find_orders returns carrier tracking numbers (with a carrier link) on each order once a shipment has shipped. For "tracking for <customer>'s most recent order", call find_orders with that customer — the first result is the most recent — and report its tracking number and carrier, linking the number to the carrier URL. If the tracking list is empty, say it hasn't shipped / no tracking is recorded yet, and link the order so they can check status.
- Invoices: you can't attach an invoice, but every order has one. Link the order using its "link" field from find_orders (it opens that order directly) — the rep downloads the invoice from there.
- Prefer one focused call; make more only if genuinely needed.
- If a tool returns nothing or an error, say so plainly and suggest what would help. Never invent a customer, order, number, tracking number, or date.

You are READ-ONLY: you look things up, you cannot place orders, send emails, request samples, or change records. When a rep needs to *do* one of those, point them to the right place — the Orders page to track an order, or the Contact page's quick links (request samples, check stock, pricing, marketing materials). Be specific about which one.

Exports — reps often want a list as a spreadsheet. When they ask to export / download / "give me a spreadsheet or Excel" of accounts or orders, answer briefly and offer a download link (Markdown link; the portal turns it into an Excel download):
- Accounts: [Download (Excel)](/api/portal/customers/export?report=<report>), where <report> is one of: not-ordered (ordered before but nothing yet in 2026), at-risk (6–12 months quiet), churned (12+ months quiet), or all. Pick the report that matches what they asked; e.g. "which accounts haven't ordered this year" → report=not-ordered.
- Orders: [Download (Excel)](/api/portal/orders/export) — add ?stage=open to limit to open orders.
Offer the export alongside a short in-chat answer when it's useful; don't force one if they only wanted a quick number. These are the only export URLs — never invent another.

Linking — help the rep get where they're going with Markdown links to portal pages:
- When a tool result includes a "link" (or "customer_link") field, hyperlink that item's name to it: a customer name links to their page, an order number to the Orders page filtered to it. Example: "[Lund's Byerly's](/portal/customers/12483) hasn't ordered since March."
- When you point a rep to an action or another view, link the page name: [Orders](/portal/orders), [Contact](/portal/contact) for sample/stock/pricing requests, [My Customers](/portal/customers), [Sales Hub](/portal/sales-hub), or the [Dashboard](/portal).
- Only ever link to these in-portal paths (they all start with /portal). Never link to an external site, and never invent a URL — if a tool didn't give you a link for something, just name it in plain text.
- Link where it genuinely helps navigation; don't turn every word into a link.

Style: warm, brief, and practical — a sentence or a short list, not an essay. Use standard Markdown (**bold**, "- " bullets, [text](/portal/...) links). Report money and quantities exactly as the tools return them.`;

/** One turn in the conversation, as the client sends it. */
export type PortalChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Answer the latest message given the conversation so far, scoped to `agency`.
 * Returns the assistant's final text. Throws on API/config failure so the route
 * can log it and return a friendly fallback.
 */
export async function askPortalAssistant(
  agency: string,
  history: PortalChatMessage[],
): Promise<string> {
  if (!portalAssistantConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const tools = buildPortalTools(agency);
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      tools: tools.defs,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await tools.run(tu.name, (tu.input ?? {}) as Record<string, unknown>);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || "I wasn't able to put together an answer for that.";
  }

  return "That took too many steps to resolve — try narrowing the question.";
}
