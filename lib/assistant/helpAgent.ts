import Anthropic from "@anthropic-ai/sdk";
import type { UserRole } from "@/components/UserContext";
import { guideForPath, guideForRole, sitemapForRole, type GuideEntry } from "@/lib/help";
import { runHelpTool, toolStatus, toolsForRole, type ToolAction, type ToolContext } from "./helpTools";

/**
 * Sage — the in-app assistant. Explains how to use the FMG portal (grounded in
 * the user guide, lib/help) AND does things for the user through the tools in
 * ./helpTools: creating drafts (email templates, tasks, social and blog posts)
 * and looking up data. It never sends, publishes or schedules.
 *
 * The guide goes in the system prompt, filtered to the pages the asker's role
 * can open, and is prompt-cached — it's identical across every turn for that
 * role. The page the user is on rides with their latest message.
 *
 * Env: ANTHROPIC_API_KEY (server-only).
 */

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6;

export function helpAssistantConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export type HelpChatMessage = { role: "user" | "assistant"; content: string };

/** What the route streams to the widget, one JSON object per line. */
export type HelpEvent =
  | { t: "text"; v: string }
  | { t: "status"; v: string }
  | ({ t: "action" } & ToolAction);

function renderGuide(entries: GuideEntry[]): string {
  return entries
    .map((g) => `<page path="${g.path}" title="${g.title}" section="${g.section}">\n${g.summary}\n\n${g.body.trim()}\n</page>`)
    .join("\n\n");
}

function systemPrompt(role: UserRole, toolNames: string[]): string {
  return `You are Sage, the assistant built into the FMG portal — the internal web app Fragrance Marketing Group staff use to run the business (wholesale + D2C customers, the Sassy and Natural Inspirations storefronts, products and inventory, sales analysis, email, marketing).

You do two things:
1. Help people use the site: where things are, what a page or button does, step-by-step how-tos.
2. Do tasks for them with your tools: ${toolNames.length ? toolNames.join(", ") : "(none available for this user)"}.

Doing tasks:
- When the user asks you to make, draft, create or add something you have a tool for, use the tool — don't just explain the steps. Pass along everything they told you (offer, products, tone, dates) in the brief.
- If a detail you truly need is missing and can't be sensibly inferred (most often which brand: Natural Inspirations or Sassy), ask one short question first. Otherwise pick sensible defaults and mention them.
- Everything you create is a DRAFT. You cannot send email, publish, post, schedule, delete, or push orders — tell the user which button on the page does that final step (and that it's theirs to click). After creating something, say what you made in a sentence or two and what to check; the app shows an "Open" button for it automatically, so don't repeat the link.
- For questions about live data (stock, sales, customers, reps), use the lookup tools when you have them and report exactly what they return. Never invent numbers, names, or results. If a tool returns an error, say so plainly.
- If they ask for something you have no tool for, say you can't do that yet and give the steps to do it themselves.

Explaining the site:
- Ground answers in the USER GUIDE below. Use the exact button, tab and page names it gives, in **bold**.
- For "how do I…" questions, give short numbered steps, starting with which page to go to as a Markdown link to its path, e.g. [Orders](/storefronts/purchases).
- Only link to paths in the guide or sitemap (or links your tools return). Never invent a page, button, setting or feature. If the guide doesn't cover it, say you're not sure and suggest the closest page or asking Blake (who builds the portal).
- The user is signed in with the "${role}" role and can only open the pages listed below. If they ask about a page outside their access, say their account doesn't include it and an owner or admin can help or change their access.
- Mention it when a step is irreversible or reaches customers (sending email, publishing, posting, pushing an order to Fishbowl).

Style: warm, brief, practical. Standard Markdown: **bold**, "- " bullets, "1." steps, [text](/path) links. No headings for short answers. No tables.

SITEMAP (sidebar for this user):
${sitemapForRole(role)}

USER GUIDE:
${renderGuide(guideForRole(role))}`;
}

/**
 * Run one turn: stream text, run any tools Sage calls (emitting status and
 * "open it" actions), and loop until it answers. Throws on API/config failure
 * so the route can turn it into a friendly error.
 */
export async function* streamHelpAnswer(
  ctx: ToolContext,
  pathname: string,
  history: HelpChatMessage[],
): AsyncGenerator<HelpEvent> {
  if (!helpAssistantConfigured()) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const tools = toolsForRole(ctx.role);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  });

  // Where the user is (and today's date), on their latest turn only — keeps
  // the cached prefix stable as they move around the site.
  const here = guideForPath(pathname);
  const where = `[I'm on ${pathname}${here ? ` — the "${here.title}" page` : ""}. Today is ${today}.]`;
  const messages: Anthropic.MessageParam[] = history.map((m, i) => ({
    role: m.role,
    content: i === history.length - 1 && m.role === "user" ? `${where}\n\n${m.content}` : m.content,
  }));

  const client = new Anthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: systemPrompt(ctx.role, tools.map((t) => t.def.name)), cache_control: { type: "ephemeral" } },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low" },
      system,
      tools: tools.map((t) => t.def),
      messages,
    });

    let wroteText = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        wroteText = true;
        yield { t: "text", v: event.delta.text };
      }
    }
    const response = await stream.finalMessage();
    if (response.stop_reason !== "tool_use") return;

    // Keep text from successive rounds apart in the one chat bubble.
    if (wroteText) yield { t: "text", v: "\n\n" };

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      yield { t: "status", v: toolStatus(tools, block.name) };
      const out = await runHelpTool(tools, block.name, (block.input ?? {}) as Record<string, unknown>, ctx);
      if (out.action) yield { t: "action", ...out.action };
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", content: results });
  }

  yield { t: "text", v: "That took too many steps — try breaking it into smaller requests." };
}
