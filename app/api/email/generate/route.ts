import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireInternalUser } from "@/lib/email/server-auth";
import { normalizeBlocks } from "@/lib/email/normalizeBlocks";
import { checkEmailImages } from "@/lib/email/generateImages";
import { gatherImageCandidates } from "@/lib/generatorImages";
import { trackUnsplashDownload } from "@/lib/unsplash";
import { buildGeneratePrompt, type GenerateInput } from "@/lib/email/generatePrompt";
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

  const brand = (["ni", "sassy", "both"].includes(body.brand ?? "") ? body.brand : "both") as Brand;
  const input: GenerateInput = {
    brand,
    channel: (["wholesale", "d2c", "both"].includes(body.channel ?? "") ? body.channel : "both") as Channel,
    purpose: (Array.isArray(body.purpose) ? body.purpose.filter((p) => typeof p === "string") : []) as TemplatePurpose[],
    prompt,
    name: typeof body.name === "string" ? body.name.slice(0, 120) : undefined,
    // Tagged Image Library photos + the brand's Unsplash collection ("both" = both).
    images: await gatherImageCandidates([brand]),
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

  const normalized = normalizeBlocks(parsed.blocks);
  if (normalized.length === 0) {
    return NextResponse.json(
      { error: "The AI didn't produce any usable blocks. Try rephrasing your description." },
      { status: 422 },
    );
  }

  // Every image URL must be one we offered; Unsplash photos get a credit line
  // and are reported as used.
  const { blocks, usedUnsplash } = checkEmailImages(normalized, input.images ?? []);
  await Promise.allSettled(
    usedUnsplash.flatMap((p) => (p.downloadLocation ? [trackUnsplashDownload(p.downloadLocation)] : [])),
  );

  return NextResponse.json({
    subject: typeof parsed.subject === "string" ? parsed.subject : "",
    preview_text: typeof parsed.preview_text === "string" ? parsed.preview_text : "",
    blocks,
  });
}
