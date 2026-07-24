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
- Prefer one focused call; make more only if genuinely needed.
- If a tool returns nothing or an error, say so plainly and suggest what would help. Never invent a customer, order, number, or date.

You are READ-ONLY: you look things up, you cannot place orders, send emails, request samples, or change records. When a rep needs to *do* one of those, point them to the right place — the Orders page to track an order, or the Contact page's quick links (request samples, check stock, pricing, marketing materials). Be specific about which one.

Style: warm, brief, and practical — a sentence or a short list, not an essay. Use standard Markdown (**bold**, "- " bullets). Report money and quantities exactly as the tools return them.`;

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
