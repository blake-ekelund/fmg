import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRAND_CONTEXT: Record<string, { name: string; tagline: string; voice: string; colors: { primary: string; secondary: string; bg: string; text: string }; products: string }> = {
  NI: {
    name: "Natural Inspirations",
    tagline: "Indulge in the Good. Eliminate the Bad.",
    voice: "Warm, spa-inspired, luxurious but approachable. Speaks to women 35-65 who value clean beauty and self-care rituals. Tone is nurturing, knowledgeable, and elegant without being pretentious. NEVER use emojis. Use typographic symbols instead: bullet points (•), em dashes (—), arrows (→), stars (★) for reviews.",
    colors: { primary: "#1a5632", secondary: "#d4a853", bg: "#f7f5f0", text: "#2d3b2d" },
    products: "Body Butter, Shower Gel, Hand Crème, Candles, Reed Diffusers, Sugar Scrubs, Lip Butter. Features ExSeed Antioxidant Complex. Clean fragrance, spa-grade formulations.",
  },
  Sassy: {
    name: "Sassy",
    tagline: "Unapologetically You.",
    voice: "Bold, playful, fun, confident. Speaks to women 20-45 who embrace self-expression. Uses casual language and exclamation marks. Think best-friend energy with a wink. NEVER use emojis — let the copy carry the energy. Use typographic symbols instead: bullet points (•), em dashes (—), arrows (→), stars (★) for reviews.",
    colors: { primary: "#d6336c", secondary: "#f06595", bg: "#fff5f7", text: "#1a1a2e" },
    products: "Hand Crème ($12-20), Lip Butter ($6), Gift Sets ($25). Fragrance names: Bestie (Grapefruit Bergamot), Hot Mess (Coconut Vanilla), Bougie Babe, Main Character.",
  },
};

type BlockType = "header" | "text" | "image" | "button" | "divider" | "spacer" | "columns" | "product" | "social" | "hero";

function buildPrompt(
  brand: string,
  templateType: string,
  purpose: string,
  products: string[],
): string {
  const b = BRAND_CONTEXT[brand] || BRAND_CONTEXT.NI;

  const productSection = products.length
    ? `\n\nFeatured products to include:\n${products.map((p) => `- ${p}`).join("\n")}`
    : "";

  if (templateType === "sms") {
    return `You are a marketing copywriter for ${b.name}. Brand voice: ${b.voice}

Write an SMS message for the following purpose: ${purpose}
${productSection}

Requirements:
- Keep under 160 characters if possible (max 320 for 2 segments)
- Include a clear CTA
- Match the brand voice exactly
- Include "Reply STOP to opt out" at the end
- Use a promo code if relevant (invent a catchy one matching the brand)

Return ONLY the SMS text, nothing else.`;
  }

  return `You are an expert email marketing designer and copywriter for ${b.name}.

Brand: ${b.name}
Tagline: "${b.tagline}"
Brand voice: ${b.voice}
Brand colors: Primary ${b.colors.primary}, Secondary ${b.colors.secondary}, Background ${b.colors.bg}, Text ${b.colors.text}
Products: ${b.products}
${productSection}

Create a complete email template for: ${purpose}
Template type: ${templateType}

Return a JSON array of email blocks. Each block must follow one of these exact schemas:

1. Header block: {"id":"unique-id","type":"header","logoUrl":"","companyName":"${b.name}","bgColor":"${b.colors.primary}","textColor":"#ffffff","padding":20}

2. Hero block: {"id":"unique-id","type":"hero","imageUrl":"","heading":"...","subheading":"...","buttonText":"...","buttonUrl":"https://naturalinspirations.com","overlay":true,"textColor":"#ffffff","padding":0}

3. Text block: {"id":"unique-id","type":"text","html":"<p>Your HTML content here</p>","fontSize":15,"fontFamily":"${brand === "NI" ? "serif" : "sans"}","textAlign":"left","textColor":"${b.colors.text}","bgColor":"#ffffff","padding":20}

4. Image block: {"id":"unique-id","type":"image","src":"","alt":"description","width":"full","align":"center","linkUrl":"","borderRadius":0,"padding":10}

5. Button block: {"id":"unique-id","type":"button","text":"...","url":"https://","bgColor":"${b.colors.primary}","textColor":"#ffffff","align":"center","borderRadius":8,"fontSize":16,"padding":20}

6. Divider block: {"id":"unique-id","type":"divider","color":"#e5e7eb","thickness":1,"style":"solid","padding":10}

7. Spacer block: {"id":"unique-id","type":"spacer","height":24}

8. Columns block: {"id":"unique-id","type":"columns","columns":2,"gap":16,"items":[{"heading":"...","text":"...","imageUrl":""},{"heading":"...","text":"...","imageUrl":""}],"padding":20}

9. Product block: {"id":"unique-id","type":"product","imageUrl":"","name":"...","description":"...","price":"$XX.XX","buttonText":"Shop Now","buttonUrl":"https://","bgColor":"#ffffff","padding":20}

10. Social block: {"id":"unique-id","type":"social","align":"center","facebook":"https://facebook.com/naturalinspirations","instagram":"https://instagram.com/naturalinspirations","tiktok":"","website":"https://naturalinspirations.com","padding":20}

IMPORTANT RULES:
- Generate unique IDs for each block (e.g., "blk-header-1", "blk-text-1", etc.)
- Write compelling, on-brand copy in the brand voice
- Use HTML formatting in text blocks (<p>, <strong>, <em>, <br>, <ul>, <li>)
- Include a header, compelling body content, clear CTA button, and social footer
- For newsletters, include more content sections (5-8 blocks minimum)
- For promotional emails, emphasize the offer with urgency
- Match the brand colors exactly
- Leave imageUrl/src empty (user will add their own images)
- NEVER use emojis anywhere in the copy. Use typographic symbols (•, —, →, ★) for visual breaks instead.
- Generate a complete, ready-to-send email structure

Also generate a subject line and preview text.

Return ONLY valid JSON in this exact format:
{"subject":"...","preview_text":"...","blocks":[...array of blocks...]}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { row_id, brand, template_type, purpose, products } = await req.json() as {
      row_id: string;
      brand: string;
      template_type: string;
      purpose: string;
      products?: string[];
    };

    if (!row_id || !brand || !purpose) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log(`=== generate-email-template === row=${row_id} brand=${brand} type=${template_type}`);

    const prompt = buildPrompt(brand, template_type, purpose, products || []);

    // Call Anthropic Claude
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Anthropic error: ${res.status} ${errText}`);
      // Update row with error status
      await fetch(`${SB}/rest/v1/email_templates?id=eq.${row_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
        body: JSON.stringify({ status: "draft", updated_at: new Date().toISOString() }),
      });
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || "";

    if (template_type === "sms") {
      // For SMS, the response is just the message text
      const smsBody = content.trim();
      await fetch(`${SB}/rest/v1/email_templates?id=eq.${row_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
        body: JSON.stringify({
          sms_body: smsBody,
          status: "draft",
          updated_at: new Date().toISOString(),
        }),
      });

      return new Response(JSON.stringify({ success: true, type: "sms" }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Parse the JSON response for email/newsletter
    let parsed: { subject?: string; preview_text?: string; blocks?: any[] };
    try {
      // Extract JSON from the response (Claude sometimes wraps in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("JSON parse error:", e, "Content:", content.substring(0, 500));
      await fetch(`${SB}/rest/v1/email_templates?id=eq.${row_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
        body: JSON.stringify({ status: "draft", updated_at: new Date().toISOString() }),
      });
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Update the template row with generated content
    await fetch(`${SB}/rest/v1/email_templates?id=eq.${row_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
      body: JSON.stringify({
        subject: parsed.subject || "",
        preview_text: parsed.preview_text || "",
        blocks: parsed.blocks || [],
        status: "draft",
        updated_at: new Date().toISOString(),
      }),
    });

    console.log(`Template generated: ${parsed.blocks?.length || 0} blocks`);

    return new Response(JSON.stringify({ success: true, blocks: parsed.blocks?.length || 0 }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("FATAL:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
