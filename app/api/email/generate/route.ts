import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeBlocks } from "@/lib/email/normalizeBlocks";
import { buildGeneratePrompt, type GenerateInput, type LibraryImage } from "@/lib/email/generatePrompt";
import type { Brand, Channel, TemplatePurpose } from "@/components/templates/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-4-8";
const MAX_PROMPT_CHARS = 4000;

/**
 * POST /api/email/generate
 *
 * Body: { brand, channel, purpose[], prompt, name? }
 * Returns: { subject, previewText, blocks } — a full email composed from our
 * block/section vocabulary, validated by normalizeBlocks so it always opens
 * cleanly in the builder. Does NOT write the DB — the caller seeds a draft.
 */

/** Curated brand images (from the Image Library) the model may place. */
async function fetchLibraryImages(): Promise<LibraryImage[]> {
  try {
    const { data, error } = await supabaseServer
      .from("email_asset_meta")
      .select("path, title, alt_text, description")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error || !data) return [];
    return data.map((r) => {
      const row = r as { path: string; title: string | null; alt_text: string | null; description: string | null };
      const { data: pub } = supabaseServer.storage.from("email-assets").getPublicUrl(row.path);
      return { url: pub.publicUrl, title: row.title, alt: row.alt_text, description: row.description };
    });
  } catch {
    return []; // table may not be migrated yet — generation still works without images
  }
}

export async function POST(request: Request) {
  const user = await requireInternalUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "AI generation isn't configured (ANTHROPIC_API_KEY is missing on the server)." },
      { status: 400 },
    );
  }

  let body: {
    brand?: string;
    channel?: string;
    purpose?: unknown;
    prompt?: string;
    name?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt) {
    return NextResponse.json({ error: "Describe the email you want to generate." }, { status: 400 });
  }

  const input: GenerateInput = {
    brand: (["ni", "sassy", "both"].includes(body.brand ?? "") ? body.brand : "both") as Brand,
    channel: (["wholesale", "d2c", "both"].includes(body.channel ?? "") ? body.channel : "both") as Channel,
    purpose: (Array.isArray(body.purpose) ? body.purpose.filter((p) => typeof p === "string") : []) as TemplatePurpose[],
    prompt,
    name: typeof body.name === "string" ? body.name.slice(0, 120) : undefined,
    images: await fetchLibraryImages(),
  };

  let text: string;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: buildGeneratePrompt(input) }],
    });
    text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI generation failed." },
      { status: 502 },
    );
  }

  // Claude may wrap JSON in prose or a code fence — extract the object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Couldn't read the generated email. Try again." }, { status: 502 });
  }
  let parsed: { subject?: unknown; preview_text?: unknown; blocks?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "The generated email wasn't valid. Try again." }, { status: 502 });
  }

  const blocks = normalizeBlocks(parsed.blocks);
  if (blocks.length === 0) {
    return NextResponse.json(
      { error: "The AI didn't produce any usable blocks. Try rephrasing your description." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    subject: typeof parsed.subject === "string" ? parsed.subject : "",
    preview_text: typeof parsed.preview_text === "string" ? parsed.preview_text : "",
    blocks,
  });
}
