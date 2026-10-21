import Anthropic from "@anthropic-ai/sdk";
import type { UserRole } from "@/components/UserContext";
import { guideForPath, guideForRole, sitemapForRole, type GuideEntry } from "@/lib/help";

/**
 * The in-app Help assistant: answers staff "how do I…" questions about using
 * the FMG portal, grounded in the user guide (lib/help). No tools and no data
 * access — it explains the site, it doesn't look up business numbers (that's
 * the Slack assistant, lib/assistant/agent.ts).
 *
 * The guide goes in the system prompt, filtered to the pages the asker's role
 * can open, and is prompt-cached — it's identical across every turn for that
 * role. The page the user is on rides with their latest message.
 *
 * Env: ANTHROPIC_API_KEY (server-only).
 */

const MODEL = "claude-opus-5-5";

export function helpAssistantConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export type HelpChatMessage = { role: "user" | "assistant"; content: string };

function renderGuide(entries: GuideEntry[]): string {
  return entries
    .map((g) => `<page path="${g.path}" title="${g.title}" section="${g.section}">\n${g.summary}\n\n${g.body.trim()}\n</page>`)
    .join("\n\n");
}

function systemPrompt(role: UserRole): string {
  return `You are the FMG Help assistant, built into the FMG portal — the internal web app Fragrance Marketing Group staff use to run the business (wholesale + D2C customers, the Sassy and Natural Inspirations storefronts, products and inventory, sales analysis, email, marketing).

Your job: help the person use the site. Explain where things are, what a page or button does, and walk them through tasks step by step.

How to answer:
- Ground every answer in the USER GUIDE below. Use the exact button, tab and page names it gives, in **bold**.
- For "how do I…" questions, give short numbered steps. Start by saying which page to go to, as a Markdown link to its path, e.g. [Orders](/storefronts/purchases).
- Only link to paths that appear in the guide or sitemap below (with real ids filled in only if the user gave them). Never invent a page, button, setting or feature.
- If the guide doesn't cover it, say you're not sure rather than guessing, and suggest the closest page or asking Blake (who builds the portal).
- The user is signed in with the "${role}" role and can only open the pages listed below. If they ask about a page outside their access, say their account doesn't include it and an owner or admin can help or change their access.
- You can't see the screen, click anything, or look up live data (sales numbers, orders, customers). For data questions, point them to the page that shows it.
- Mention it when a step is irreversible or reaches customers (sending email, publishing, posting, pushing an order to Fishbowl).
- Style: warm, brief, practical. Standard Markdown: **bold**, "- " bullets, "1." steps, [text](/path) links. No headings for short answers. No tables.

SITEMAP (sidebar for this user):
${sitemapForRole(role)}

USER GUIDE:
${renderGuide(guideForRole(role))}`;
}

/**
 * Stream the reply to the latest message. Yields text deltas; throws on
 * API/config failure so the route can turn it into a friendly error.
 */
export async function* streamHelpAnswer(
  role: UserRole,
  pathname: string,
  history: HelpChatMessage[],
): AsyncGenerator<string> {
  if (!helpAssistantConfigured()) throw new Error("ANTHROPIC_API_KEY is not configured.");

  // Tell the model where the user is, on their latest turn only (keeps the
  // cached prefix stable as they move around the site).
  const here = guideForPath(pathname);
  const where = `[I'm on ${pathname}${here ? ` — the "${here.title}" page` : ""}]`;
  const messages: Anthropic.MessageParam[] = history.map((m, i) => ({
    role: m.role,
    content: i === history.length - 1 && m.role === "user" ? `${where}\n\n${m.content}` : m.content,
  }));

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low" },
    system: [{ type: "text", text: systemPrompt(role), cache_control: { type: "ephemeral" } }],
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
