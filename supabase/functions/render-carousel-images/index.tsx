import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const THEMES: Record<string, { name: string; tagline: string; mood: string }> = {
  NI: {
    name: "Natural Inspirations",
    tagline: "Indulge in the Good",
    mood: "spa-inspired, serene, luxurious, natural earth tones, soft warm lighting, clean beauty aesthetic, botanical, deep blues and soft golds",
  },
  Sassy: {
    name: "Sassy",
    tagline: "Unapologetically You",
    mood: "bold, playful, vibrant, youthful energy, pink and magenta tones, trendy lifestyle, confident feminine, fun and flirty",
  },
};

type Slide = { slide: number; text_overlay: string; image_url: string; image_desc: string };

function getSlideType(n: number, total: number): string {
  if (n === 1) return "title";
  if (n === total) return "cta";
  return ["content", "quote", "callout", "content"][(n - 2) % 4];
}

function buildPrompt(slideType: string, text: string, brand: string, direction: string): string {
  const t = THEMES[brand] || THEMES.NI;

  const base: Record<string, string> = {
    title: `Design a premium social media carousel TITLE slide (1080x1080) for ${t.name}. Style: ${t.mood}. This is the opening hook slide. Theme: "${direction}". Include the text "${text}" as a bold, elegant headline. The text should be large, centered, and highly readable with a beautiful background. Add subtle brand element or tagline "${t.tagline}".`,
    content: `Design a social media carousel CONTENT slide (1080x1080) for ${t.name}. Style: ${t.mood}. Theme: "${direction}". Feature the text "${text}" as the main message — clear, stylish typography over a lifestyle/beauty background. Text must be fully readable.`,
    quote: `Design a social media carousel QUOTE slide (1080x1080) for ${t.name}. Style: ${t.mood}. Theme: "${direction}". Display "${text}" as an inspirational quote — elegant typography, centered, with decorative accents. Clean background that lets the text shine.`,
    callout: `Design a social media carousel CALLOUT slide (1080x1080) for ${t.name}. Style: ${t.mood}. Theme: "${direction}". Bold attention-grabbing design with the text "${text}" — use dynamic layout, accent colors, strong visual hierarchy.`,
    cta: `Design a social media carousel CTA (call-to-action) closing slide (1080x1080) for ${t.name}. Style: ${t.mood}. Theme: "${direction}". Display "${text}" as the closing call to action. Include brand name "${t.name}". Warm, inviting, encouraging engagement.`,
  };

  return `${base[slideType] || base.content} The slide should look professionally designed for Instagram. Square 1:1 format. High quality. The text MUST be spelled exactly as provided and be the focal point.`;
}

async function generateSlide(slideType: string, text: string, brand: string, direction: string): Promise<Uint8Array | null> {
  if (!OPENAI_KEY) { console.error("No OPENAI_API_KEY"); return null; }

  const prompt = buildPrompt(slideType, text, brand, direction);

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "url" }),
    });

    if (!res.ok) {
      console.error(`DALL-E ${slideType}: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) return null;

    // Fetch the image bytes
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) return null;
    return new Uint8Array(await imgRes.arrayBuffer());
  } catch (e) {
    console.error(`DALL-E err ${slideType}:`, e);
    return null;
  }
}

async function upload(png: Uint8Array, brand: string, pid: string, sn: number): Promise<string> {
  const p = `${brand}/${pid}/slide-${sn}.png`;
  const r = await fetch(`${SB}/storage/v1/object/social-carousel-images/${p}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SK}`, apikey: SK, "Content-Type": "image/png", "x-upsert": "true" },
    body: png,
  });
  if (!r.ok) {
    const errBody = await r.text();
    console.error(`UPLOAD FAILED ${sn}: ${r.status} ${errBody}`);
    throw new Error(`Upload fail ${sn}: ${r.status} ${errBody}`);
  }
  return `${SB}/storage/v1/object/public/social-carousel-images/${p}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { post_id, brand, direction, carousel_slides } = await req.json() as { post_id: string; brand: string; direction?: string; carousel_slides: Slide[] };
    if (!post_id || !brand || !carousel_slides?.length) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    console.log(`=== render-carousel v7 (DALL-E only) === post=${post_id} brand=${brand} slides=${carousel_slides.length}`);
    const tot = carousel_slides.length;
    const dir = direction || "beauty and self-care";
    const out: (Slide & { rendered_image_url: string })[] = [];
    let generated = 0;

    // Process slides sequentially — one DALL-E call at a time to stay within memory
    for (const s of carousel_slides) {
      const slideType = getSlideType(s.slide, tot);
      console.log(`Slide ${s.slide}/${tot} [${slideType}]: "${s.text_overlay}"`);

      const imgBytes = await generateSlide(slideType, s.text_overlay, brand, dir);

      if (imgBytes) {
        const url = await upload(imgBytes, brand, post_id, s.slide);
        out.push({ ...s, rendered_image_url: url });
        generated++;
        console.log(`Slide ${s.slide} uploaded: ${url}`);
      } else {
        // No image generated — keep slide without rendered URL
        out.push({ ...s, rendered_image_url: "" });
        console.warn(`Slide ${s.slide} failed — no image`);
      }
    }

    // Update DB with rendered URLs
    const dbRes = await fetch(`${SB}/rest/v1/social_media_posts?id=eq.${post_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", apikey: SK, Authorization: `Bearer ${SK}` },
      body: JSON.stringify({ carousel_slides: out, updated_at: new Date().toISOString() }),
    });
    if (!dbRes.ok) console.error(`DB update failed: ${dbRes.status} ${await dbRes.text()}`);

    return new Response(JSON.stringify({ success: true, generated, total: tot, slides: out.map(s => ({ slide: s.slide, url: s.rendered_image_url })) }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("FATAL:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
