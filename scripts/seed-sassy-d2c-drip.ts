/**
 * One-time setup for the "Sassy D2C Drip" — the 7-email post-purchase /
 * reorder / win-back sequence for Sassy+Co storefront customers.
 *
 * Creates (idempotently — re-running updates in place, matched by name/code):
 *   1. Email-sized copies of the Sassy site imagery in the email-assets bucket
 *      (Image Library, under sassy/drip/), resized from store/sassy/public.
 *      Hotlinking sassyandco.com is avoided on purpose: its bot protection
 *      answers non-browser fetches with 429, which image proxies can trip.
 *   2. Four Sassy discounts: SASSYSHIP (free shipping) and SASSY10 (10%) as
 *      shared codes; COMEBACK15 and LASTCALL20 as unique-code batches that the
 *      automation mints per recipient via {{discountCode:BATCH}}.
 *   3. Seven block-builder templates (brand sassy, channel d2c) — fully
 *      editable in /templates.
 *   4. The automation itself, DISABLED, with its seven steps.
 *
 * Usage:  npx tsx scripts/seed-sassy-d2c-drip.ts
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 */

import { readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import type { EmailBlock, ImageBlock, SectionColumn } from "../components/templates/types";

for (const line of readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const SASSY_PUBLIC = path.join(__dirname, "..", "..", "store", "sassy", "public");
const SITE = "https://sassyandco.com";
const BUCKET = "email-assets";
const AUTOMATION_NAME = "Sassy D2C Drip";

/* Sassy palette (store/sassy/src/app/globals.css). */
const PINK = "#FF3E86";
const BURGUNDY = "#761E0B";
const BLUSH = "#F1E6E4";
const ROSE = "#B3295C";

/* ─── 1. Images ──────────────────────────────────────────────────────────── */

type Img = { key: string; src: string; width: number; title: string; alt: string; format?: "png" };
const IMAGES: Img[] = [
  { key: "logo", src: "white-logo.png", width: 360, title: "Sassy+Co logo (white)", alt: "Sassy+Co", format: "png" },
  { key: "group", src: "group/Group_Header_1920x577_01.jpg", width: 1200, title: "Sassy crew banner", alt: "The whole Sassy+Co crew" },
  { key: "lips", src: "holiday/lip-butter-display.jpg", width: 1200, title: "Sassy lip butters", alt: "Sassy+Co lip butters" },
  { key: "bestieHeader", src: "bestie/Bestie_Header_1920x577_01.jpg", width: 1200, title: "Bestie banner", alt: "Bestie hand crème" },
  { key: "queenHeader", src: "queen/Queen_Header_1920x577_01.jpg", width: 1200, title: "Queen banner", alt: "Queen hand crème" },
  { key: "hotmessHeader", src: "hotmess/Hot-Mess_Header_1920x577_01.jpg", width: 1200, title: "Hot Mess banner", alt: "Hot Mess hand crème" },
  { key: "fierceHeader", src: "firecevibes/Fierce_Header_1920x577_01.jpg", width: 1200, title: "Fierce Vibes banner", alt: "Fierce Vibes hand crème" },
  { key: "queen", src: "queen/Queen_Image_1080x1080_01.jpg", width: 560, title: "Queen square", alt: "Queen" },
  { key: "bougie", src: "bougiebabe/Bougie-Babe_Image_1080x1080_01.jpg", width: 560, title: "Bougie Babe square", alt: "Bougie Babe" },
  { key: "bestie", src: "bestie/Bestie_Image_1080x1080_01.jpg", width: 560, title: "Bestie square", alt: "Bestie" },
  { key: "glowup", src: "glowup/Glow-Up_Image_1080x1080_01.jpg", width: 560, title: "Glow Up square", alt: "Glow Up" },
  { key: "fierce", src: "firecevibes/Fierce_Image_1080x1080_01.jpg", width: 560, title: "Fierce Vibes square", alt: "Fierce Vibes" },
  { key: "hotmess", src: "hotmess/Hot-Mess_Image_1080x1080_01.jpg", width: 560, title: "Hot Mess square", alt: "Hot Mess" },
];

async function uploadImages(): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const img of IMAGES) {
    const input = readFileSync(path.join(SASSY_PUBLIC, img.src));
    const pipeline = sharp(input).resize({ width: img.width, withoutEnlargement: true });
    const body = img.format === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: 78, progressive: true, mozjpeg: true }).toBuffer();
    const storagePath = `sassy/drip/${img.key}.${img.format ?? "jpg"}`;
    const { error } = await db.storage.from(BUCKET).upload(storagePath, body, {
      contentType: img.format === "png" ? "image/png" : "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`upload ${storagePath}: ${error.message}`);
    // Image Library sidecar metadata (optional table — ignore if absent).
    await db.from("email_asset_meta").upsert({
      path: storagePath,
      title: img.title,
      alt_text: img.alt,
      description: `Sassy D2C Drip — resized from sassyandco.com/${img.src}`,
      share_scope: "internal",
      updated_at: new Date().toISOString(),
    });
    urls[img.key] = db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
    console.log(`  image ${storagePath} (${Math.round(body.length / 1024)} KB)`);
  }
  return urls;
}

/* ─── 2. Discounts ───────────────────────────────────────────────────────── */

const DISCOUNTS = [
  { code: "SASSYSHIP", kind: "free_shipping", value: 0, free_shipping: true, unique_codes: false, per_customer_limit: 1, note: "Sassy D2C Drip — email 4 (Day 75) restock nudge" },
  { code: "SASSY10", kind: "percent", value: 10, free_shipping: false, unique_codes: false, per_customer_limit: 1, note: "Sassy D2C Drip — email 5 (Day 155)" },
  { code: "COMEBACK15", kind: "percent", value: 15, free_shipping: false, unique_codes: true, per_customer_limit: null, note: "Sassy D2C Drip — email 6 (Day 210). Unique codes minted per recipient at send." },
  { code: "LASTCALL20", kind: "percent", value: 20, free_shipping: false, unique_codes: true, per_customer_limit: null, note: "Sassy D2C Drip — email 7 (Day 270). Unique codes minted per recipient at send." },
];

async function upsertDiscounts() {
  for (const d of DISCOUNTS) {
    const row = { ...d, brand: "Sassy", active: true, min_subtotal: null, starts_at: null, ends_at: null };
    const { data: existing } = await db.from("storefront_discounts").select("id").eq("code", d.code).maybeSingle();
    const { error } = existing
      ? await db.from("storefront_discounts").update(row).eq("id", existing.id)
      : await db.from("storefront_discounts").insert(row);
    if (error) throw new Error(`discount ${d.code}: ${error.message}`);
    console.log(`  discount ${d.code} ${existing ? "updated" : "created"}`);
  }
}

/* ─── 3. Templates ───────────────────────────────────────────────────────── */

let n = 0;
const id = (p: string) => `sassy-${p}-${++n}`;

const header = (logo: string): EmailBlock => ({
  id: id("header"), type: "header", logoUrl: logo, companyName: "Sassy+Co",
  bgColor: PINK, textColor: "#ffffff", padding: 18,
});
const image = (src: string, alt: string, linkUrl: string, padding = 0): ImageBlock => ({
  id: id("img"), type: "image", src, alt, width: "full", align: "center", linkUrl, borderRadius: 0, padding,
});
const headline = (text: string): EmailBlock => ({
  id: id("h"), type: "text", html: `<p><strong>${text}</strong></p>`, fontSize: 30, fontFamily: "sans",
  textAlign: "center", textColor: PINK, bgColor: "#ffffff", padding: 24, marginTop: 8,
});
const body = (html: string, fontSize = 16): EmailBlock => ({
  id: id("p"), type: "text", html, fontSize, fontFamily: "sans",
  textAlign: "center", textColor: BURGUNDY, bgColor: "#ffffff", padding: 20,
});
const button = (text: string, url: string): EmailBlock => ({
  id: id("btn"), type: "button", text, url, bgColor: PINK, textColor: "#ffffff",
  align: "center", borderRadius: 999, fontSize: 15, padding: 24,
});
const promo = (label: string, headlineText: string, description: string, code: string, fine: string, cta: string, url: string): EmailBlock => ({
  id: id("promo"), type: "promotion", promotionId: "", headline: headlineText, description, promoCode: code,
  discountLabel: label, expiresLabel: fine, buttonText: cta, buttonUrl: url,
  bgColor: BLUSH, accentColor: PINK, textColor: BURGUNDY, padding: 24,
});

type Persona = { name: string; tagline: string; img: string; part: string };
const tile = (p: Persona, urls: Record<string, string>): SectionColumn => ({
  id: id("col"), weight: 1, bgColor: "", verticalAlign: "top", padding: 6,
  blocks: [
    { ...image(urls[p.img], p.name, `${SITE}/products/${p.part}`), borderRadius: 12 },
    {
      id: id("t"), type: "text", html: `<p><strong>${p.name.toUpperCase()}</strong><br>${p.tagline}</p>`,
      fontSize: 13, fontFamily: "sans", textAlign: "center", textColor: BURGUNDY, bgColor: "", padding: 8,
    },
  ],
});
const grid = (people: Persona[], urls: Record<string, string>): EmailBlock[] => {
  const rows: EmailBlock[] = [];
  for (let i = 0; i < people.length; i += 2) {
    rows.push({
      id: id("sec"), type: "section", bgColor: "", bgImage: "", padding: 12, gap: 12,
      stackOnMobile: false, verticalAlign: "top",
      columns: people.slice(i, i + 2).map((p) => tile(p, urls)),
    });
  }
  return rows;
};

const nav = (): EmailBlock =>
  body(
    `<p><a href="${SITE}/shop">Shop</a> · <a href="${SITE}/quiz">Find your Sassy</a> · <a href="${SITE}/order">Find my order</a></p>`,
    13,
  );
const footer = (): EmailBlock => ({
  id: id("footer"), type: "footer",
  // CAN-SPAM requires a postal address in every marketing email; this is the
  // company letterhead address (a USPS-registered PO box qualifies).
  text: "You're getting this because you ordered from Sassy+Co. Sassy+Co by Fragrance Marketing Group, LLC · PO Box 762, Excelsior, MN 55331. Unsubscribing is allowed but emotionally devastating.",
  unsubscribeLabel: "Unsubscribe",
  bgColor: BLUSH, textColor: BURGUNDY, linkColor: ROSE, fontSize: 12, textAlign: "center", padding: 24,
});
const shell = (logo: string, blocks: EmailBlock[]): EmailBlock[] => [header(logo), ...blocks, nav(), footer()];

function templates(urls: Record<string, string>) {
  const people: Persona[] = [
    { name: "Queen", tagline: "Power moves + no apologies.", img: "queen", part: "123-00-02" },
    { name: "Bougie Babe", tagline: "Glam + luxe elegance.", img: "bougie", part: "123-00-01" },
    { name: "Bestie", tagline: "Love + all the tea.", img: "bestie", part: "123-00-04" },
    { name: "Glow Up", tagline: "Sea salt citrus, infused with style.", img: "glowup", part: "123-00-05" },
    { name: "Fierce Vibes", tagline: "Hustle + unstoppable energy.", img: "fierce", part: "123-00-07" },
    { name: "Hot Mess", tagline: "Chaos + effortless charm.", img: "hotmess", part: "123-00-06" },
  ];
  const creams = `${SITE}/shop?type=mini+hand+cr%C3%A8me`;
  const lips = `${SITE}/shop?type=lip+butter`;
  const gifts = `${SITE}/shop?type=gift+set`;
  const shop = `${SITE}/shop`;

  return [
    {
      day: 1, delay: 0, purpose: ["welcome"],
      name: "Sassy D2C Drip 1 — Welcome to the group chat (Day 1)",
      subject: "Your Sassy just shipped. Here's how to get the most out of it",
      preview: "Soft skin, big mood, zero apologies.",
      blocks: shell(urls.logo, [
        image(urls.group, "The whole Sassy+Co crew", `${SITE}/quiz`),
        headline("WELCOME TO THE GROUP CHAT"),
        body("<p>Your order is on its way, and honestly? Great taste. Every Sassy+Co crème is made to sink in fast, smell amazing, and match whatever mood you're in today.</p><p><strong>Pro tip:</strong> a pea-sized amount is plenty. Warm it between your palms, then work it into your knuckles and cuticles, where dry skin hides.</p>"),
        button("Meet the crew", `${SITE}/quiz`),
      ]),
    },
    {
      day: 10, delay: 9, purpose: ["product_launch"],
      name: "Sassy D2C Drip 2 — Same attitude, softer pout (Day 10)",
      subject: "Your hands are handled. Now about those lips…",
      preview: "Lip butters in all six personalities.",
      blocks: shell(urls.logo, [
        image(urls.lips, "Sassy+Co lip butters", lips),
        headline("SAME ATTITUDE, SOFTER POUT"),
        body("<p>You've got the hand crème. Lip butter is the matching set: same scent, same personality, made for the pocket you always lose your lip balm in.</p>"),
        button("Shop lip butters", lips),
      ]),
    },
    {
      day: 30, delay: 20, purpose: ["newsletter"],
      name: "Sassy D2C Drip 3 — Which Sassy are you next? (Day 30)",
      subject: "Five more moods where that came from",
      preview: "Six personalities. Pick your next one.",
      blocks: shell(urls.logo, [
        headline("WHICH SASSY ARE YOU NEXT?"),
        body("<p>Nobody is just one mood. Here's the whole lineup, so your next favorite is one click away.</p>"),
        ...grid(people, urls),
        button("Shop all", shop),
        body("<p><strong>Gifting someone?</strong> Our gift sets come wrapped, ribboned, and ready to hand over.</p>"),
        button("Shop gift sets", gifts),
      ]),
    },
    {
      day: 75, delay: 45, purpose: ["promotion"],
      name: "Sassy D2C Drip 4 — Running low? Free shipping (Day 75)",
      subject: "A 2oz mini lasts about 8 weeks. Just saying",
      preview: "Free shipping on your restock, on us.",
      blocks: shell(urls.logo, [
        image(urls.bestieHeader, "Bestie hand crème", creams),
        headline("RUNNING LOW?"),
        body("<p>By now that mini is probably getting squeezed from the bottom. Restock before you're stuck with dry hands and regret.</p>"),
        promo("FREE SHIPPING", "Your restock ships free", "No minimum. Enter the code at checkout.", "SASSYSHIP", "", "Restock now", creams),
      ]),
    },
    {
      day: 155, delay: 80, purpose: ["promotion", "winback"],
      name: "Sassy D2C Drip 5 — Miss us yet? 10% off (Day 155)",
      subject: "Your hands called. They want their crème back",
      preview: "10% off whatever you're feeling today.",
      blocks: shell(urls.logo, [
        image(urls.queenHeader, "Queen hand crème", shop),
        headline("MISS US YET?"),
        body("<p>It's been a minute. Your favorite is still here, and so are five others ready for their turn.</p>"),
        promo("10% OFF", "10% off your next order", "Enter the code at checkout.", "SASSY10", "", "Shop now", shop),
        ...grid(people.slice(0, 4), urls),
      ]),
    },
    {
      day: 210, delay: 55, purpose: ["winback", "promotion"],
      name: "Sassy D2C Drip 6 — It's not you, 15% off (Day 210)",
      subject: "15% off to make things right",
      preview: "We'd like to see you again. Here's 15% off.",
      blocks: shell(urls.logo, [
        image(urls.hotmessHeader, "Hot Mess hand crème", shop),
        headline("IT'S NOT YOU. IT'S YOUR DRY HANDS."),
        body("<p>We've been thinking about you (in a normal way). Come back and we'll take 15% off your whole order.</p>"),
        promo("15% OFF", "15% off, just for you", "This code is yours alone and works once.", "{{discountCode:COMEBACK15}}", "", "Come back", shop),
      ]),
    },
    {
      day: 270, delay: 60, purpose: ["winback", "promotion"],
      name: "Sassy D2C Drip 7 — Last call, 20% off (Day 270)",
      subject: "20% off, then we'll stop blowing up your inbox",
      preview: "Our biggest offer, and our last email for a while.",
      blocks: shell(urls.logo, [
        image(urls.fierceHeader, "Fierce Vibes hand crème", shop),
        headline("LAST CALL"),
        body("<p>This is our biggest offer, and our last email for a while. After this we'll give your inbox some space.</p>"),
        promo("20% OFF", "20% off everything", "This code is yours alone and works once.", "{{discountCode:LASTCALL20}}", "", "Use my 20%", shop),
        body("<p>Not for you anymore? No hard feelings. The unsubscribe link is below.</p>", 13),
      ]),
    },
  ];
}

async function upsertTemplates(urls: Record<string, string>) {
  const out: Array<{ id: string; delay: number }> = [];
  for (const t of templates(urls)) {
    const row = {
      name: t.name, subject: t.subject, preview_text: t.preview, blocks: t.blocks,
      source: "blocks", type: "email", brand: "sassy", channel: "d2c", status: "active",
      from_name: "Sassy+Co", purpose: t.purpose,
      description: `Sassy D2C Drip, email ${out.length + 1} of 7 — sends ${t.day} day(s) after a customer's last Sassy order.`,
    };
    const { data: existing } = await db.from("email_templates").select("id").eq("name", t.name).maybeSingle();
    const res = existing
      ? await db.from("email_templates").update(row).eq("id", existing.id).select("id").single()
      : await db.from("email_templates").insert(row).select("id").single();
    if (res.error || !res.data) throw new Error(`template ${t.name}: ${res.error?.message}`);
    out.push({ id: res.data.id as string, delay: t.delay });
    console.log(`  template ${existing ? "updated" : "created"}: ${t.name}`);
  }
  return out;
}

/* ─── 4. Automation ──────────────────────────────────────────────────────── */

async function upsertAutomation(steps: Array<{ id: string; delay: number }>) {
  const row = {
    name: AUTOMATION_NAME,
    description:
      "7-email Sassy reorder drip: Day 1 welcome → Day 270 last call. Starts the day after a customer's latest Sassy order; any new Sassy order restarts it at Day 1. Offers from Day 75 (free ship, 10%, then per-customer 15%/20% codes).",
    trigger_type: "order_event",
    trigger_config: {
      audience: "d2c",
      brand: "Sassy",
      order_event_type: "last",
      days_after: 1,
      // Short lookback so switching it on doesn't send a "your order just
      // shipped" welcome to someone who ordered a month ago.
      lookback_days: 3,
      exit_on_order: true,
      reenroll_on_new_order: true,
      // Top of the pecking order: a Sassy buyer gets this drip, not the
      // general D2C lifecycle (lib/automations/overlap.ts).
      flow_kind: "journey",
      priority: 1,
      batch_mode: "continuous",
    },
  };
  const { data: existing } = await db.from("automations").select("id").eq("name", AUTOMATION_NAME).maybeSingle();
  const res = existing
    ? await db.from("automations").update(row).eq("id", existing.id).select("id").single()
    : await db.from("automations").insert({ ...row, enabled: false }).select("id").single();
  if (res.error || !res.data) throw new Error(`automation: ${res.error?.message}`);
  const automationId = res.data.id as string;

  // Replace the steps wholesale — only safe while nobody is enrolled.
  const { count } = await db
    .from("automation_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("automation_id", automationId);
  if ((count ?? 0) > 0) {
    console.log(`  automation has ${count} enrollment(s) — leaving its steps alone`);
  } else {
    await db.from("automation_steps").delete().eq("automation_id", automationId);
    const { error } = await db.from("automation_steps").insert(
      steps.map((s, i) => ({ automation_id: automationId, step_order: i + 1, template_id: s.id, delay_days: s.delay })),
    );
    if (error) throw new Error(`steps: ${error.message}`);
  }
  console.log(`  automation ${existing ? "updated" : "created (disabled)"}: ${automationId}`);
}

async function main() {
  console.log("Images…");
  const urls = await uploadImages();
  console.log("Discounts…");
  await upsertDiscounts();
  console.log("Templates…");
  const steps = await upsertTemplates(urls);
  console.log("Automation…");
  await upsertAutomation(steps);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
