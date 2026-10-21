import type Anthropic from "@anthropic-ai/sdk";
import type { UserRole } from "@/components/UserContext";
import { getAllowedPaths } from "@/components/navConfig";
import { supabaseServer } from "@/lib/supabaseServer";
import { TOOL_DEFS as DATA_TOOL_DEFS, runTool as runDataTool } from "./tools";

/**
 * What Sage (the in-app assistant) can DO, beyond explaining the site.
 *
 * The rule: Sage creates DRAFTS and looks things up. It never sends, publishes,
 * schedules, deletes or pushes anything — every create here lands as a draft
 * the user opens, checks and ships themselves. That keeps every action
 * reversible without needing a confirm step in the chat.
 *
 * Each tool is gated on a page: it's only offered when the user's role can open
 * that page (getAllowedPaths), so Sage can't do anything the user couldn't do
 * by hand. Creates that have an API route call it server-to-server with the
 * user's own token, so they run through exactly the same validation and
 * permission checks as the UI; the rest mirror what the page writes.
 */

export type ToolContext = {
  role: UserRole;
  userId: string;
  /** Origin of the incoming request, for server-to-server calls to our own routes. */
  origin: string;
  /** The user's "Bearer …" header, forwarded so self-calls act as them. */
  authorization: string;
};

/** Something Sage made — shown in the chat as a button to open it. */
export type ToolAction = { label: string; href: string };

type ToolResult = { result: unknown; action?: ToolAction };

type HelpTool = {
  def: Anthropic.Tool;
  /** Page the user must be able to open for this tool to be offered. */
  page: string;
  /** Shown in the chat while it runs, e.g. "Writing the email…". */
  status: string;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function callApi<T>(ctx: ToolContext, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL(path, ctx.origin), {
    method,
    headers: { "Content-Type": "application/json", Authorization: ctx.authorization },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `${path} failed (${res.status}).`);
  return json;
}

const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const pickMany = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : [];

/* ------------------------------------------------------------------ */
/* Create tools                                                       */
/* ------------------------------------------------------------------ */

const TEMPLATE_PURPOSES = ["newsletter", "winback", "promotion", "product_launch", "welcome", "announcement", "other"] as const;

const createEmailTemplate: HelpTool = {
  page: "/templates",
  status: "Writing the email template…",
  def: {
    name: "create_email_template",
    description:
      "Create a new designed email template (a DRAFT on the Email Templates page) written by AI from a brief — same as the page's 'Generate with AI' option. Nothing is sent. Use when the user asks you to make/draft/create an email or template. Takes up to a minute.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template title shown in the library, e.g. 'NI Holiday Gift Guide 2026'." },
        brief: {
          type: "string",
          description:
            "What the email should say and include: goal, offer/discount, products, tone, call-to-action, hero idea. Be specific — pass along everything the user told you.",
        },
        brand: { type: "string", enum: ["ni", "sassy", "both"], description: "Natural Inspirations, Sassy, or both." },
        audience: { type: "string", enum: ["wholesale", "d2c", "both"], description: "Wholesale retailers, direct-to-consumer shoppers, or both." },
        purposes: { type: "array", items: { type: "string", enum: [...TEMPLATE_PURPOSES] } },
      },
      required: ["name", "brief", "brand", "audience"],
    },
  },
  async run(input, ctx) {
    const brand = pick(input.brand, ["ni", "sassy", "both"] as const, "both");
    const channel = pick(input.audience, ["wholesale", "d2c", "both"] as const, "both");
    const purpose = pickMany(input.purposes, TEMPLATE_PURPOSES);
    const name = str(input.name, 120) || "Untitled Template";
    const gen = await callApi<{ subject: string; preview_text: string; blocks: unknown[] }>(ctx, "POST", "/api/email/generate", {
      brand,
      channel,
      purpose,
      prompt: str(input.brief),
      name,
    });
    // Same row the editor's first autosave writes for a wizard-made template.
    const { data, error } = await supabaseServer
      .from("email_templates")
      .insert({
        name,
        subject: gen.subject,
        type: "email",
        brand,
        channel,
        source: "blocks",
        blocks: gen.blocks,
        raw_html: null,
        text_body: null,
        sms_body: "",
        preview_text: gen.preview_text,
        from_name: "",
        purpose,
        description: "Drafted by Sage",
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't save the template.");
    return {
      result: { created: true, id: data.id, name, subject: gen.subject, preview_text: gen.preview_text, blocks: gen.blocks.length, link: `/templates?edit=${data.id}` },
      action: { label: `Open “${name}”`, href: `/templates?edit=${data.id}` },
    };
  },
};

const createTask: HelpTool = {
  page: "/task-list",
  status: "Adding the task…",
  def: {
    name: "create_task",
    description:
      "Add a task to the Task List. Use when the user asks you to add/create a task, to-do or reminder. If they name an owner, pass their first name; the tool checks it against the team.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task title." },
        description: { type: "string" },
        owner: { type: "string", description: "Team member's first name, e.g. 'Julie'. Omit if not given." },
        priority: { type: "string", enum: ["High", "Medium", "Low"] },
        due_date: { type: "string", description: "YYYY-MM-DD. Resolve relative dates ('Friday') using today's date." },
      },
      required: ["name"],
    },
  },
  async run(input) {
    const name = str(input.name, 200);
    if (!name) throw new Error("A task needs a name.");
    let owner: string | null = null;
    const wanted = str(input.owner, 80);
    if (wanted) {
      // Owners are stored as staff first names (see lib/team-owners.ts).
      const { data } = await supabaseServer.from("profiles").select("first_name, access");
      const names = [...new Set(
        ((data ?? []) as { first_name: string | null; access: string | null }[])
          .filter((r) => r.access && r.access !== "rep" && r.first_name?.trim())
          .map((r) => r.first_name!.trim()),
      )];
      owner = names.find((n) => n.toLowerCase() === wanted.toLowerCase()) ?? null;
      if (!owner) return { result: { created: false, error: `No team member named "${wanted}".`, team: names } };
    }
    const due = str(input.due_date, 10);
    const { data, error } = await supabaseServer
      .from("tasks")
      .insert({
        name,
        description: str(input.description, 2000) || null,
        owner,
        priority: pick(input.priority, ["High", "Medium", "Low"] as const, "Medium"),
        status: "todo",
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        completed: false,
        notes: null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't add the task.");
    return { result: { created: true, id: data.id, name, owner, link: "/task-list" }, action: { label: "Open Task List", href: "/task-list" } };
  },
};

const SOCIAL_PURPOSES = ["education", "product", "launch", "community", "seasonal", "promo"] as const;

const createSocialPost: HelpTool = {
  page: "/marketing/social",
  status: "Writing the social post…",
  def: {
    name: "create_social_post",
    description:
      "Create a social media post DRAFT (Instagram/Facebook) written and designed by AI — same as 'New post' with AI on the Social Media page. Nothing is posted or scheduled. Takes up to a minute.",
    input_schema: {
      type: "object",
      properties: {
        brand: { type: "string", enum: ["Sassy", "NI"] },
        brief: { type: "string", description: "What the post is about — product, message, offer, tone. Pass along everything the user said." },
        purpose: { type: "string", enum: [...SOCIAL_PURPOSES] },
        platforms: { type: "array", items: { type: "string", enum: ["instagram", "facebook"] } },
        format: { type: "string", enum: ["carousel", "single"], description: "Carousel (several slides) or a single image. Default carousel." },
        slide_count: { type: "integer", description: "Slides for a carousel, 3–8. Default 5." },
      },
      required: ["brand", "brief"],
    },
  },
  async run(input, ctx) {
    const brand = pick(input.brand, ["Sassy", "NI"] as const, "NI");
    const platforms = pickMany(input.platforms, ["instagram", "facebook"] as const);
    const plats = platforms.length ? platforms : ["instagram", "facebook"];
    const gen = await callApi<{ title: string; design: unknown; scheduleSuggestion?: string | null }>(ctx, "POST", "/api/social/generate", {
      brand,
      purpose: pick(input.purpose, SOCIAL_PURPOSES, "education"),
      platforms: plats,
      format: input.format === "single" ? "single" : "carousel",
      slideCount: Math.min(8, Math.max(3, Math.round(Number(input.slide_count) || 5))),
      prompt: str(input.brief, 3000),
      parts: [],
    });
    const { post } = await callApi<{ post: { id: string; title?: string | null } }>(ctx, "POST", "/api/social/posts", {
      brand,
      platforms: plats,
      title: gen.title,
      design: gen.design,
    });
    const title = post.title ?? gen.title;
    return {
      result: { created: true, id: post.id, title, status: "draft", link: `/marketing/social/${post.id}` },
      action: { label: `Open “${title || "social post"}”`, href: `/marketing/social/${post.id}` },
    };
  },
};

const BLOG_PURPOSES = ["product_spotlight", "ingredient_story", "ritual_howto", "seasonal_gift", "new_arrival", "brand_story", "news", "other"] as const;

const createBlogPost: HelpTool = {
  page: "/marketing/blog",
  status: "Writing the blog post…",
  def: {
    name: "create_blog_post",
    description:
      "Create a blog post DRAFT written by AI in the brand's format — same as the Blog Posts wizard's AI option. Nothing is published. Takes up to a minute or two.",
    input_schema: {
      type: "object",
      properties: {
        brand: { type: "string", enum: ["Sassy", "NI"] },
        title: { type: "string" },
        brief: { type: "string", description: "What the article should cover. Pass along everything the user said." },
        audience: { type: "string", enum: ["d2c", "wholesale", "both"], description: "d2c = shoppers reading the storefront blog. Default d2c." },
        purpose: { type: "string", enum: [...BLOG_PURPOSES] },
      },
      required: ["brand", "title", "brief"],
    },
  },
  async run(input, ctx) {
    const base = {
      brand: pick(input.brand, ["Sassy", "NI"] as const, "NI"),
      title: str(input.title, 200),
      audience: pick(input.audience, ["d2c", "wholesale", "both"] as const, "d2c"),
      purpose: pick(input.purpose, BLOG_PURPOSES, "other"),
      description: "",
    };
    const gen = await callApi<{ blocks: unknown[]; seo_meta: string; tags: string[]; hero_image_url: string }>(
      ctx,
      "POST",
      "/api/marketing/blog/generate",
      { ...base, prompt: str(input.brief) },
    );
    const { post } = await callApi<{ post: { id: string } }>(ctx, "POST", "/api/marketing/blog", {
      ...base,
      blocks: gen.blocks,
      seo_meta: gen.seo_meta,
      tags: gen.tags,
      hero_image_url: gen.hero_image_url,
    });
    return {
      result: { created: true, id: post.id, title: base.title, status: "draft", link: `/marketing/blog/${post.id}` },
      action: { label: `Open “${base.title}”`, href: `/marketing/blog/${post.id}` },
    };
  },
};

/* ------------------------------------------------------------------ */
/* Read-only data lookups (shared with the Slack assistant)           */
/* ------------------------------------------------------------------ */

const DATA_PAGES: Record<string, string> = {
  get_inventory: "/inventory",
  sales_summary: "/sales",
  customer_lookup: "/customers",
  list_sales_reps: "/sales-team",
};

const DATA_STATUS: Record<string, string> = {
  get_inventory: "Checking inventory…",
  sales_summary: "Pulling sales numbers…",
  customer_lookup: "Looking up the customer…",
  list_sales_reps: "Checking the rep directory…",
};

const dataTools: HelpTool[] = DATA_TOOL_DEFS.map((d) => ({
  def: { name: d.name, description: d.description, input_schema: d.input_schema },
  page: DATA_PAGES[d.name] ?? "/dashboard",
  status: DATA_STATUS[d.name] ?? "Looking that up…",
  run: async (input) => ({ result: await runDataTool(d.name, input) }),
}));

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

const ALL_TOOLS: HelpTool[] = [createEmailTemplate, createTask, createSocialPost, createBlogPost, ...dataTools];

/** The tools this role may use — each needs access to its page. */
export function toolsForRole(role: UserRole): HelpTool[] {
  const allowed = getAllowedPaths(role);
  return ALL_TOOLS.filter((t) => allowed.some((p) => t.page === p || t.page.startsWith(p + "/")));
}

/** Run a tool; errors come back as a result Claude can explain, never a throw. */
export async function runHelpTool(
  tools: HelpTool[],
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find((t) => t.def.name === name);
  if (!tool) return { result: { error: `That action isn't available to you: ${name}` } };
  try {
    return await tool.run(input, ctx);
  } catch (e) {
    console.error(`[sage:${name}]`, e);
    return { result: { error: e instanceof Error ? e.message : String(e) } };
  }
}

export function toolStatus(tools: HelpTool[], name: string): string {
  return tools.find((t) => t.def.name === name)?.status ?? "Working on it…";
}
