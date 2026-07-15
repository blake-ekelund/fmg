import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFS, runTool } from "./tools";

/**
 * The FMG assistant: a Claude tool-use loop that answers business questions
 * over FMG's data (inventory, sales, customers, reps) via the read-only tools
 * in ./tools. Used by the Slack events route once the asker is confirmed to be
 * internal FMG staff. Nothing here is user-facing on its own.
 *
 * Env: ANTHROPIC_API_KEY (server-only).
 */

const MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 6;

export function assistantConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

const SYSTEM_PROMPT = `You are the FMG assistant, answering questions from Fragrance Marketing Group (FMG) employees inside Slack.

FMG is a fragrance and personal-care company. It runs two storefronts (Sassy and Natural Inspirations), sells wholesale to retailers through independent sales agencies, and tracks inventory in Fishbowl. You help staff quickly look up business data.

You have read-only tools to look up inventory/stock, sales performance, customers, and the sales-rep directory. Use them:
- Call a tool whenever a question depends on current FMG data — do not answer sales, stock, or customer questions from memory.
- Prefer one focused tool call; call more only if genuinely needed to answer.
- If a tool returns an error or no results, say so plainly and suggest what you'd need. Never invent numbers, customers, parts, or reps.

Formatting for Slack (mrkdwn, NOT standard Markdown):
- Bold uses single asterisks: *like this* (never **double**).
- Use short bullet lines ("• ") and keep answers tight — a sentence or a short list, not an essay.
- Money and quantities: report exactly what the tools return.

You cannot take actions (send emails, place orders, edit records) — you only look things up. If asked to do something beyond lookups, say that isn't something you can do yet.`;

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

/**
 * Answer one question. Runs the tool-use loop to completion and returns the
 * assistant's final text. Throws on API/config failure so the caller can log
 * and post a friendly fallback to Slack.
 */
export async function askAssistant(question: string): Promise<string> {
  if (!assistantConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFS,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Preserve the assistant turn (tool_use blocks), then answer each call.
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const out = await runTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(out),
        });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // Terminal turn — collect the text.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || "I wasn't able to put together an answer for that.";
  }

  return "That took too many steps to resolve — try narrowing the question.";
}

// Re-export the block types for callers that want to introspect (kept minimal).
export type { TextBlock, ToolUseBlock };
