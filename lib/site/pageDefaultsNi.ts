/**
 * The editable NATURAL INSPIRATIONS storefront pages, what each may contain,
 * and their defaults (the pages exactly as they were hand-coded, Oct 2026).
 * Sassy's pages live in pageDefaults.ts.
 *
 * KEEP IN SYNC: byte-identical in fmg lib/site/ and store/ni src/lib/fmg/ —
 * see pageBlocks.ts.
 */
import {
  newBlockFor,
  normalizePageFor,
  type PageBlock,
  type PageBlockType,
  type SitePageDef,
} from "./pageBlocks";

export type NiPageSlug =
  | "home"
  | "home-wholesale"
  | "product"
  | "shop"
  | "collections"
  | "story"
  | "exseed"
  | "ingredient-philosophy"
  | "ingredients"
  | "ingredients-by-product"
  | "faq"
  | "blog"
  | "contact"
  | "shipping"
  | "returns"
  | "payment-terms"
  | "terms"
  | "privacy";

// ── shared pieces ──────────────────────────────────────────────────────────

const NEWSLETTER: PageBlock = {
  id: "newsletter",
  type: "newsletter",
  eyebrow: "Stay inspired",
  heading: "10% off your first order,\nand a little calm in your inbox.",
  body: "New fragrances, ingredient stories, and simple ways to bring the spa home. Never more than feels good.",
  footnote: "",
};

function header(eyebrow: string, title: string, lede: string, id = "header"): PageBlock {
  return { id, type: "page_header", eyebrow, title, lede, wholesaleEyebrow: "", wholesaleTitle: "", wholesaleLede: "" };
}

function cta(heading: string, primary: [string, string], secondary: [string, string], id = "cta"): PageBlock {
  return {
    id,
    type: "cta",
    heading,
    primaryLabel: primary[0],
    primaryHref: primary[1],
    secondaryLabel: secondary[0],
    secondaryHref: secondary[1],
  };
}

const SEEDS_SHORT = [
  { id: "black-cumin", name: "Black Cumin", note: "from the delicate nigella flower" },
  { id: "pomegranate", name: "Pomegranate", note: "jewel-bright seeds of the ripe fruit" },
  { id: "cranberry", name: "Cranberry", note: "tiny seeds of the tart wild berry" },
  { id: "carrot", name: "Carrot", note: "gathered from the wild carrot's lacy bloom" },
  { id: "grape", name: "Grape", note: "pressed from the seeds of the vine" },
];

const SEED_BAND_BODY = `<p>Five sustainably sourced seeds, gently cold-pressed so nothing of their goodness is lost. Blended together, their oils carry nearly four times the antioxidants of the seed oils on their own — to nourish and soften skin in every formula we make.</p>`;

// ── pages ──────────────────────────────────────────────────────────────────

const HOME: PageBlock[] = [
  { id: "hero", type: "living_hero" },
  {
    id: "values",
    type: "value_strip",
    items: ["Women-owned", "Made in the USA", "Plant-based", "Cruelty-free", "Free shipping over $75"],
  },
  {
    id: "collections",
    type: "collection_showcase",
    eyebrow: "Eight signature scents",
    heading: "Find your fragrance",
    lede: "Every collection is designed to feel clean, fresh, and never overpowering — choose the one that feels like you.",
    linkLabel: "All collections →",
    comfort: ["Free shipping over $75", "[Ships within 1 business day](/shipping)", "[Easy 30-day returns](/returns)"],
  },
  {
    id: "exseed",
    type: "seed_band",
    eyebrow: "From seed to skin",
    heading: "The ExSeed® Deep\nMoisturizing Complex",
    html: SEED_BAND_BODY,
    items: SEEDS_SHORT,
    ctaLabel: "The full ingredient story →",
    ctaHref: "/story",
  },
  {
    id: "philosophy",
    type: "two_lists",
    eyebrow: "Our ingredient philosophy",
    heading: "Indulge in the Good.\nEliminate the Bad.",
    leftTitle: "Always in",
    leftItems: [
      "Cold-pressed seed oils, rich in antioxidants",
      "Shea butter and coconut oil for deep moisture",
      "Pure essential oils and natural botanicals",
      "Skin-loving humectants that hydrate and soften",
    ],
    rightTitle: "Never in",
    rightItems: ["No parabens or sulfates", "No phthalates", "No gluten", "Never tested on animals"],
  },
  NEWSLETTER,
];

const HOME_WHOLESALE: PageBlock[] = [
  {
    id: "intro",
    type: "wholesale_intro",
    eyebrow: "Wholesale line sheet",
    title: "The wholesale *program*",
    lede: "Everything we make, priced by the case. Spa-grade body care that earns its shelf space — elevated packaging, clean formulas, and fragrances your guests will come back for.",
    stats: [
      { id: "packs", label: "Case packs", value: "12 / 24" },
      { id: "opening", label: "Opening order", value: "$300" },
      { id: "terms", label: "Payment terms", value: "Credit card" },
      { id: "ship", label: "Ship time", value: "3–5 days" },
    ],
  },
  { id: "catalog", type: "wholesale_catalog", heading: "Current catalog", linkLabel: "Full sheet →", count: 8 },
  {
    id: "rep",
    type: "callout",
    eyebrow: "Your account rep",
    heading: "Need a custom assortment?",
    html: `<p>Curated mixed cases, tester programs, and amenity partnerships for spas and resorts. Email <a href="mailto:jekelund@fragrancemarketinggroup.com">jekelund@fragrancemarketinggroup.com</a> and we’ll put a plan together.</p>`,
  },
];

const PRODUCT: PageBlock[] = [
  { id: "details", type: "product_details", trust: ["Ships within 1 business day", "easy 30-day returns"] },
  {
    id: "exseed",
    type: "seed_band",
    eyebrow: "From seed to skin",
    heading: "The ExSeed® Deep Moisturizing Complex",
    html: SEED_BAND_BODY,
    items: SEEDS_SHORT,
    ctaLabel: "Meet the five seeds →",
    ctaHref: "/exseed",
  },
  {
    id: "philosophy",
    type: "philosophy",
    columns: [
      {
        id: "fragrance",
        eyebrow: "Fragrance first",
        heading: "Clean, fresh, and never overpowering.",
        intro: "Every Natural Inspirations fragrance is designed to feel like a spa moment — uplifting, comforting, and balanced.",
        subheading: "",
        body: `<p>We blend essential oils and fine fragrance into rich, spa-grade textures, so the scent you fall for in the bottle stays soft and beautiful on your skin — all day, never loud.</p>`,
        pullQuote: "Fresh. Nourishing. Elevated.",
      },
      {
        id: "philosophy",
        eyebrow: "The philosophy",
        heading: "Indulge in the Good. Eliminate the Bad.",
        intro:
          "Nutrient-rich botanical oils, antioxidant-packed seed oils, shea butter, and skin-loving humectants — the good your skin already knows how to use. And never parabens, sulfates, phthalates, or gluten. Never tested on animals.",
        subheading: "",
        body: "",
        pullQuote: "",
      },
    ],
  },
  { id: "related", type: "related_products", heading: "Complete the ritual", wholesaleHeading: "Round out the order" },
];

const SHOP: PageBlock[] = [
  {
    id: "header",
    type: "page_header",
    eyebrow: "The full collection",
    title: "Shop all",
    lede: "Every fragrance, every form — lotions, crèmes, body butters, dry oils, and mists, all made with the ExSeed® Deep Moisturizing Complex.",
    wholesaleEyebrow: "Wholesale line sheet",
    wholesaleTitle: "Line sheet",
    wholesaleLede: "Every product, every case price, in one place. MOQ is 1 case per item. Minimum opening order $300, reorders $300.",
  },
  { id: "catalog", type: "catalog" },
  NEWSLETTER,
];

const COLLECTIONS: PageBlock[] = [
  header(
    "Eight signature scents",
    "Find your fragrance",
    "Fragrance is where every Natural Inspirations ritual begins. Each collection is designed to feel clean, fresh, and uplifting — never overpowering — and carries through the whole line, from hand and body lotion to body butter and beyond.",
  ),
  { id: "catalog", type: "catalog" },
  NEWSLETTER,
];

const STORY: PageBlock[] = [
  header(
    "Our story",
    "Where clean fragrance meets *spa-grade care*.",
    "Natural Inspirations is a women-owned body care company, made in the USA. We started with a simple belief: self-care shouldn't ask you to choose between a fragrance you love, a formula that performs, and ingredients you trust. So we make products that deliver all three — and feel like a quiet moment at the spa, every time you reach for them.",
  ),
  {
    id: "pillars",
    type: "pillars",
    items: [
      {
        id: "fragrance",
        title: "Gorgeous, clean fragrance",
        body: "Every scent is designed to feel fresh, comforting, and elevated — never overpowering. Fragrance is where the ritual begins, so we treat it with the care of a fine perfumer and the restraint of a spa.",
      },
      {
        id: "spa",
        title: "Spa-grade formulations",
        body: "Rich textures, high-performance blends, professional-quality results. These are the products you meet at a beautiful spa — made for every day at home.",
      },
      {
        id: "clean",
        title: "Clean ingredients",
        body: "Guided by one philosophy: Indulge in the Good. Eliminate the Bad. Plant-based, thoughtfully sourced, and free of parabens, sulfates, phthalates, and gluten.",
      },
    ],
  },
  {
    id: "exseed",
    type: "seed_band",
    eyebrow: "The science of softness",
    heading: "ExSeed® Deep Moisturizing Complex",
    html: `<p>At the heart of every Natural Inspirations body care formula is ExSeed® — our proprietary blend of five sustainably sourced, cold-pressed seed oils: black cumin, pomegranate, cranberry, carrot, and grape.</p><p>The oils are extracted with a patented cold-press process that preserves their antioxidant benefits. The resulting blend delivers antioxidant levels nearly <strong>4× higher</strong> than the seed oils alone — helping protect, nourish, and soften skin, naturally.</p>`,
    items: [
      { id: "black-cumin", name: "Black Cumin", note: "Among the highest antioxidant levels of all plant oils — helps protect healthy cells." },
      { id: "pomegranate", name: "Pomegranate", note: "High polyphenol content makes it a powerful antioxidant." },
      { id: "cranberry", name: "Cranberry", note: "Extremely rich in antioxidants that help eliminate free radicals." },
      { id: "carrot", name: "Carrot", note: "A nourishing seed oil that supports overall skin health." },
      { id: "grape", name: "Grape", note: "Antioxidant-rich, light, and fast-absorbing." },
    ],
    ctaLabel: "",
    ctaHref: "",
  },
  {
    id: "philosophy",
    type: "philosophy",
    columns: [
      {
        id: "in",
        eyebrow: "Indulge in the Good",
        heading: "What goes in.",
        intro:
          "Nutrient-rich botanical oils. Antioxidant-packed seed oils. Shea butter and coconut oil. Pure essential oils and skin-loving humectants that hydrate, soften, and support your skin's natural barrier — the good your skin already knows how to use.",
        subheading: "",
        body: "",
        pullQuote: "",
      },
      {
        id: "out",
        eyebrow: "Eliminate the Bad",
        heading: "What stays out.",
        intro:
          "No parabens. No sulfates. No phthalates. No gluten. Never tested on animals. We skip the fillers and mystery ingredients — so every formula reads as clean as it feels.",
        subheading: "",
        body: "",
        pullQuote: "",
      },
    ],
  },
  cta("Bring the spa home.", ["Find your fragrance", "/collections"], ["Wholesale partnerships", "/wholesale"]),
  NEWSLETTER,
];

const EXSEED: PageBlock[] = [
  header(
    "From seed to skin",
    "The ExSeed® Deep Moisturizing Complex",
    "ExSeed® begins in the garden: five sustainably sourced seeds — black cumin, pomegranate, grape, carrot, and cranberry — gently cold-pressed so everything good about them stays whole. Together they help replenish, moisturize, and protect skin, in every body care formula we make.",
  ),
  {
    id: "press",
    type: "statement",
    eyebrow: "The gentle press",
    heading: "Nearly four times the antioxidants",
    body: "A patented cold-press keeps each seed's goodness intact. Blended together, the five oils carry nearly four times the antioxidants of the seed oils on their own — to nourish and soften skin, naturally.",
  },
  {
    id: "seeds",
    type: "seed_cards",
    eyebrow: "Five seeds, one complex",
    heading: "Meet the five seeds",
    items: [
      {
        id: "black-cumin",
        name: "Black Cumin",
        origin: "From the nigella flower — a pale blue bloom with tiny black seeds.",
        body: "One of the richest antioxidant oils in the plant world, and a gentle, calming one — a comforting touch for dry, easily stressed skin.",
      },
      {
        id: "pomegranate",
        name: "Pomegranate",
        origin: "From the jewel-bright seeds of the ripe fruit.",
        body: "Naturally rich in antioxidants, it nourishes deeply and leaves skin feeling soft, supple, and renewed — a favorite for dry and maturing skin.",
      },
      {
        id: "grape",
        name: "Grape",
        origin: "Pressed from the seeds of the vine after harvest.",
        body: "Light and silky, it sinks in quickly, carrying vitamin E and natural moisture that leave skin smooth and never greasy.",
      },
      {
        id: "carrot",
        name: "Carrot",
        origin: "From the lacy white flower heads of the wild carrot.",
        body: "A golden, deeply nourishing oil long loved for dry and mature skin — helping it look smoother, softer, and more radiant.",
      },
      {
        id: "cranberry",
        name: "Cranberry",
        origin: "From the tiny seeds of the tart wild berry.",
        body: "Balanced and replenishing, it conditions skin with natural omegas and antioxidants — light, fast-absorbing, and quietly restorative.",
      },
    ],
    closingHeading: "In every body care formula.",
    closingBody: "The same five seeds are at the heart of every lotion, crème, butter, and wash we make.",
    ctaLabel: "Shop the collection →",
    ctaHref: "/shop",
  },
  {
    id: "safety",
    type: "checklist",
    eyebrow: "And we don't stop there",
    heading: "Safety is our first ingredient.",
    intro:
      "We're continually researching ingredients and natural solutions for the most pampering, effective body care we can make. Safety in ingredient choice and manufacturing is our number one concern.",
    items: [
      "ExSeed® is formulated and tested by doctors.",
      "We use verified lab tests, and we never test on animals.",
      "All of our liquid products are biodegradable.",
      "Raw materials are renewable whenever possible — often coconut-, olive-, corn-, or soy-based.",
      "Preservatives are used at the minimum needed for freshness, safety, and utility.",
      "Every ingredient is assessed for health and safety — on its own, and again in the finished formula.",
      "All products are made in the USA at a cosmetic-grade (CGMP) facility.",
    ],
    marker: "leaf",
  },
  cta(
    "Curious what else is in the bottle?",
    ["The ingredient glossary", "/ingredients"],
    ["Our ingredient philosophy", "/ingredient-philosophy"],
  ),
  NEWSLETTER,
];

const INGREDIENT_PHILOSOPHY: PageBlock[] = [
  header(
    "Our ingredient philosophy",
    "Indulge in the Good.\n*Eliminate the Bad.*",
    "It started with a simple belief: you shouldn't have to choose between a product that pampers and a product you can trust. So we build every formula around ingredients that support skin health — and leave out the long list of things that don't belong.",
  ),
  {
    id: "supports",
    type: "link_grid",
    eyebrow: "Supports skin health",
    heading: "The good we build around",
    items: [
      ["Coconut Oil", "coconut-oil"],
      ["Shea Butter", "shea-butter"],
      ["Essential Oils", "essential-oils"],
      ["Pomegranate Seed Oil", "pomegranate-seed-oil"],
      ["Grape Seed Oil", "grape-seed-oil"],
      ["Cranberry Seed Oil", "cranberry-seed-oil"],
      ["Black Cumin Seed Oil", "black-cumin-seed-oil"],
      ["Carrot Seed Oil", "carrot-seed-oil"],
      ["Vitamin E", "vitamin-e"],
    ].map(([label, slug]) => ({ id: slug, label, href: `/ingredients#${slug}` })),
  },
  {
    id: "lists",
    type: "two_lists",
    eyebrow: "",
    heading: "",
    leftTitle: "Indulge in the good",
    leftItems: ["100% Vegan", "Made in the USA", "Women-Owned + Operated"],
    rightTitle: "Eliminate the bad",
    rightItems: [
      "Parabens",
      "Sulfates",
      "Gluten",
      "Phthalates",
      "GMOs",
      "Synthetic Dyes",
      "Mineral Oil",
      "EDTA",
      "PEG",
      "Propylene Glycol",
      "Triclosan",
      "Animal Testing",
    ].map((x) => `${x}-free`),
  },
  {
    id: "safety",
    type: "checklist",
    eyebrow: "And we don't stop there",
    heading: "Safety is our #1 concern.",
    intro:
      "We're continually researching ingredients and natural solutions for the most pampering, effective body care we can make — and holding every one of them to the same standard.",
    items: [
      "Lab-tested products, never tested on animals.",
      "Biodegradable liquid formulations.",
      "Plant-derived materials chosen selectively — for craft, consistency, and safety.",
      "Sustainable, renewable raw materials whenever possible.",
      "Minimal preservatives, used only for freshness and safety.",
      "Every ingredient assessed on its own and again in the finished product.",
      "Made in the USA at a cosmetic-grade (CGMP) facility.",
    ],
    marker: "check",
  },
  cta("See exactly what each ingredient does.", ["The ingredient glossary", "/ingredients"], ["The ExSeed® complex", "/exseed"]),
  NEWSLETTER,
];

const INGREDIENTS: PageBlock[] = [
  header(
    "Ingredient glossary",
    "Every ingredient, *explained*.",
    "We believe in knowing exactly what you're putting on your skin. Here is every ingredient on our labels — what it is, where it comes from, and what it does. Looking for a specific product? [See ingredients by product](/ingredients-by-product).",
  ),
  { id: "catalog", type: "catalog" },
  NEWSLETTER,
];

const INGREDIENTS_BY_PRODUCT: PageBlock[] = [
  header(
    "Ingredients by product",
    "What's in *every bottle*.",
    "The full ingredient list for each of our formulas, exactly as it appears on the label. Choose a scent to see its list, and tap any ingredient to learn what it does.",
  ),
  { id: "catalog", type: "catalog" },
  {
    id: "links",
    type: "link_cards",
    cards: [
      {
        id: "glossary",
        eyebrow: "A to Z",
        title: "The ingredient glossary →",
        body: "Every ingredient, what it is and why it's there.",
        href: "/ingredients",
      },
      {
        id: "philosophy",
        eyebrow: "What we leave out",
        title: "Our ingredient philosophy →",
        body: "Paraben-, sulfate- and phthalate-free, 100% vegan.",
        href: "/ingredient-philosophy",
      },
    ],
  },
  NEWSLETTER,
];

function faq(id: string, heading: string, items: [string, string][]): PageBlock {
  return { id, type: "faq", heading, items: items.map(([q, a], i) => ({ id: `${id}${i + 1}`, q, a })) };
}

const FAQ: PageBlock[] = [
  header(
    "Good to know",
    "Frequently asked questions",
    "Everything you might want to know before you reach for the bottle. Can't find your answer? [Get in touch](/contact) — we reply within a business day.",
  ),
  faq("products", "Our products", [
    [
      "What makes Natural Inspirations different?",
      "Three things, together: gorgeous clean fragrance, spa-grade textures that actually perform, and ingredients you can trust. Most brands ask you to give up one for the others — we set out to deliver all three.",
    ],
    [
      "What is the ExSeed® Deep Moisturizing Complex?",
      "It's our proprietary blend of five cold-pressed seed oils — black cumin, pomegranate, grape, carrot, and cranberry — at the heart of every body care formula. A patented cold-press process preserves the seeds' antioxidants, delivering levels nearly 4× higher than the oils alone.",
    ],
    [
      "How do I choose a fragrance?",
      "Start with the mood you're after — coastal and bright, calm and floral, warm and comforting. Our fragrance collections page walks you through all eight scent stories, and our minis and sample packets are a low-commitment way to find your one.",
    ],
    [
      "Are your products good for sensitive skin?",
      "Our formulas are plant-based and free of common irritants like parabens, sulfates, phthalates, and gluten. If fragrance is a concern, start with our lightest scents or try a mini first. As always, patch test if your skin is reactive.",
    ],
  ]),
  faq("values", "Ingredients & values", [
    [
      "Are your products vegan and cruelty-free?",
      "Yes — 100% vegan and never tested on animals. We're also women-owned and operated, and everything is made in the USA.",
    ],
    [
      "What do you leave out?",
      "No parabens, sulfates, phthalates, gluten, GMOs, synthetic dyes, mineral oil, EDTA, PEG, propylene glycol, or triclosan. We call it our philosophy: indulge in the good, eliminate the bad.",
    ],
    [
      "Where can I see a full ingredient list?",
      "Every product page carries its complete label. For plain-language explanations of our hero ingredients, visit the ingredient glossary.",
    ],
    [
      "How are your products made?",
      "At a cosmetic-grade (CGMP) facility in the USA. Ingredients are lab-tested and assessed for safety on their own and again in the finished formula, and all of our liquid products are biodegradable.",
    ],
  ]),
  faq("orders", "Orders & shipping", [
    [
      "How much is shipping, and when will my order arrive?",
      "Shipping is free on orders over $75 (a flat $7.50 below that). Orders placed before 12pm CT ship the same business day, and standard ground arrives in 3–5 business days within the contiguous US.",
    ],
    [
      "What's your return policy?",
      "You have 30 days from delivery to return an item — gently used is fine, because you have to try a lotion to know it's the one. Just reach out through our contact page with your order number.",
    ],
    [
      "Do you ship internationally?",
      "Not yet — we currently ship within the United States. International retailers interested in carrying the line are welcome to reach out through our wholesale program.",
    ],
  ]),
  faq("wholesale", "Wholesale", [
    [
      "Do you offer wholesale?",
      "We do. Natural Inspirations is a favorite in spas, resorts, and boutiques. Case packs come in 12 and 24, the opening order is $300, and billing is by credit card at checkout.",
    ],
    [
      "How do I become a wholesale partner?",
      "Apply through our wholesale page. Once you're approved, you'll see wholesale pricing and can order directly from your account dashboard.",
    ],
  ]),
  NEWSLETTER,
];

const BLOG: PageBlock[] = [
  header(
    "The journal",
    "Notes from the spa",
    "Ingredient stories, simple rituals, and what's new — written the way we'd tell a friend.",
  ),
  { id: "catalog", type: "catalog" },
  NEWSLETTER,
];

const CONTACT: PageBlock[] = [
  header(
    "Get in touch",
    "Drop us a line",
    "Questions about a product, an order, or carrying Natural Inspirations in your store — we read every note and reply within a business day from a real person.",
  ),
  { id: "form", type: "contact_form", heading: "Tell us what's on your mind", subheading: "The more detail you share, the faster we can help." },
  {
    id: "cards",
    type: "info_cards",
    cards: [
      {
        id: "hours",
        tone: "blush",
        label: "Response time",
        title: "We reply within a business day",
        body: "We aim to get back to everyone within a business day — weekends may run a little slower.",
        email: "",
        phone: "",
        details: "Consumer (CST) | Mon–Fri, 8:00–4:30\nRetailer (CST) | Mon–Fri, 9:00–5:00",
        linkLabel: "",
        linkHref: "",
      },
      {
        id: "direct",
        tone: "plain",
        label: "Call or email",
        title: "",
        body: "",
        email: "hello@fragrancemarketinggroup.com",
        phone: "952-466-7417",
        details: "",
        linkLabel: "",
        linkHref: "",
      },
      {
        id: "press",
        tone: "ink",
        label: "Press & wholesale",
        title: "",
        body: "Stockists, press samples, and line sheets:",
        email: "jekelund@fragrancemarketinggroup.com",
        phone: "",
        details: "",
        linkLabel: "Or apply online →",
        linkHref: "/wholesale/apply",
      },
    ],
  },
];

const SHIPPING: PageBlock[] = [
  header("The practical part", "Shipping", "From our door to yours, carefully packed and quickly on its way."),
  faq("faq", "", [
    [
      "When will my order ship?",
      "Orders placed before 12pm CT ship the same business day; everything else ships the next. You'll receive tracking by email the moment the label is created.",
    ],
    [
      "How much does shipping cost?",
      "Shipping is free on orders over $75. Below that, a flat $7.50 covers standard ground anywhere in the contiguous US.",
    ],
    [
      "How long does delivery take?",
      "Standard ground arrives in 3–5 business days. Alaska, Hawaii, and US territories may take a little longer.",
    ],
    [
      "Do you ship internationally?",
      "Not yet — we currently ship within the United States. If you're an international retailer interested in carrying the line, reach out through our wholesale program.",
    ],
    [
      "What about wholesale orders?",
      "Wholesale orders ship in 3–5 business days with credit card billing at checkout. Details live in your wholesale dashboard.",
    ],
  ]),
  {
    id: "closing",
    type: "rich_text",
    html: `<p>Something else on your mind? <a href="/contact">Contact us</a> — we reply within a business day.</p>`,
  },
];

const RETURNS: PageBlock[] = [
  header(
    "No hard feelings",
    "Returns",
    "We want every bottle to earn its place on your shelf. If one doesn't, we'll make it easy.",
  ),
  faq("faq", "", [
    [
      "What's your return policy?",
      "If something isn't right, you have 30 days from delivery to return it. Gently used is fine — we know you have to try a lotion to know it's the one.",
    ],
    [
      "How do I start a return?",
      "Email us through the contact page with your order number and what you'd like to return. We'll send a prepaid label and process your refund within 3–5 business days of receiving it.",
    ],
    [
      "Can I exchange a fragrance?",
      "Of course. If a scent isn't you, we'll happily swap it for another collection — just tell us which one when you reach out.",
    ],
    [
      "My order arrived damaged.",
      "We're sorry — send a photo with your order number and we'll ship a replacement right away. No need to return the damaged item.",
    ],
    [
      "What about wholesale returns?",
      "Wholesale orders follow the terms in your partner agreement. Reach out to your account rep and we'll make it right.",
    ],
  ]),
  {
    id: "closing",
    type: "rich_text",
    html: `<p>Ready to start one? <a href="/contact">Contact us</a> with your order number.</p>`,
  },
];

function policy(eyebrow: string, title: string, updated: string, lede: string, html: string): PageBlock[] {
  return [
    {
      id: "policy",
      type: "policy",
      eyebrow,
      title,
      lede,
      highlightLabel: "last updated",
      highlightTitle: updated,
      highlightBody: "",
      help: "",
      html,
    },
  ];
}

const TERMS = policy(
  "The fine print",
  "Terms of Service",
  "July 26, 2026",
  `These Terms & Conditions govern your access to and use of the Natural Inspirations website and your purchases from it. The website is operated by Fragrance Marketing Group, LLC ("Company," "we," "us"). By using the site or placing an order, you agree to these terms.`,
  `<h2>Permitted use &amp; limited license</h2><p>You may access and view the content on this website for personal, non-commercial purposes only. The website and all information and materials contained herein are and shall remain the property of the Company. You may not modify, copy, distribute, republish, or commercially exploit any material without our prior written permission.</p><h2>Copyrights &amp; trademarks</h2><p>All content on this site — including text, graphics, logos, product photography, and the ExSeed® name and formulations — is owned by or licensed to the Company and protected by intellectual property laws. Reproduction or the creation of derivative works is prohibited without written permission.</p><h2>Acceptable use</h2><p>You agree not to use the website to post or transmit unlawful, threatening, or defamatory content; distribute malware; send spam; impersonate others; attempt to gain unauthorized access to our systems; or otherwise exploit the site commercially without authorization.</p><h2>Product availability &amp; pricing</h2><p>Prices and availability of the products listed on the website are subject to change without notice. We make every effort to display accurate information, but errors can occur. If a product is mispriced, we reserve the right to cancel the order without penalty; if your card has already been charged for a cancelled order, we will issue a credit promptly.</p><h2>Order acceptance</h2><p>We reserve the right to refuse, cancel, or limit any order for any reason — including inventory limitations, pricing errors, or suspected fraud — and to require additional verification before accepting an order. We will contact you if your order is cancelled or if we need more information.</p><h2>Shipping &amp; returns</h2><p>Shipping and returns are governed by our separate <a href="/shipping">Shipping Policy</a> and <a href="/returns">Returns Policy</a>, which you should review before purchasing. Payment terms are described in our <a href="/payment-terms">Payment Terms</a>.</p><h2>User submissions</h2><p>Any content you submit to us through the website (such as reviews, messages, or ideas) grants the Company a perpetual, worldwide, royalty-free license to use, reproduce, and display that content for any purpose. Do not submit anything you are not entitled to share.</p><h2>Disclaimer</h2><p>The website and its content are provided on an <strong>“as is”</strong> and <strong>“as available”</strong> basis. To the fullest extent permitted by law, the Company disclaims all warranties, express or implied, regarding the accuracy, reliability, or availability of the site, and does not warrant that it will be uninterrupted or error-free. Our products are cosmetics, not medical treatments; nothing on the site is intended as medical advice.</p><h2>Limitation of liability</h2><p>To the fullest extent permitted by law, in no event shall the Company or any affiliated entity be liable for any lost profits, lost data, or any special, incidental, indirect, or consequential damages arising out of or related to your use of the website or products.</p><h2>Privacy</h2><p>Your use of the website is also governed by our <a href="/privacy">Privacy Policy</a>, which is incorporated into these terms by reference.</p><h2>Copyright complaints (DMCA)</h2><p>If you believe content on this site infringes your copyright, please contact our Copyright Agent: Fragrance Marketing Group, LLC Legal Department, 124 West Columbia Court, Chaska, MN 55318; 1.952.466.7419.</p><h2>Governing law</h2><p>These terms are governed by the laws of the State of Minnesota, without regard to its conflict-of-laws rules. You agree to the exclusive jurisdiction and venue of the state and federal courts located in Minnesota.</p><h2>Contact</h2><p>Fragrance Marketing Group, LLC<br>7925 Stone Creek Dr #130, Chanhassen, MN 55317<br><a href="mailto:hello@fragrancemarketinggroup.com">hello@fragrancemarketinggroup.com</a> · 952-466-7417</p>`,
);

const PRIVACY = policy(
  "Your privacy",
  "Privacy Policy",
  "July 26, 2026",
  `This Privacy Policy explains how Fragrance Marketing Group, LLC, which operates Natural Inspirations ("we," "us"), collects, uses, and discloses your personal information when you visit our website, place an order, or otherwise interact with us.`,
  `<h2>Changes to this privacy policy</h2><p>We may update this policy from time to time to reflect changes to our practices or for legal reasons. We will post the revised policy here and update the “last updated” date above.</p><h2>How we collect and use your personal information</h2><p>We collect information you provide directly, information collected automatically as you use the site, and information from vendors and service providers. This may include:</p><ul><li><strong>Contact details</strong> — name, shipping and billing address, phone number, and email address.</li><li><strong>Order and account information</strong> — items purchased, order history, and wholesale account details.</li><li><strong>Payment information</strong> — processed securely by our third-party payment processors; we do not store full card numbers.</li><li><strong>Usage data</strong> — collected through cookies and similar technologies when you browse the site.</li></ul><p>We use this information to:</p><ul><li>Fulfill and ship your orders and provide customer support;</li><li>Send marketing and transactional communications you've agreed to;</li><li>Detect fraud and keep our site and customers secure;</li><li>Improve our products, services, and website.</li></ul><h2>Cookies</h2><p>We use cookies and similar technologies to operate the site, remember your cart, understand how the site is used, and support marketing. You can control cookies through your browser settings; disabling some cookies may affect how the site works.</p><h2>How we disclose personal information</h2><p>We do not sell your personal information. We share it only as needed with service providers who help us run our business, including:</p><ul><li>Hosting and infrastructure providers;</li><li>Payment processors;</li><li>Shipping carriers and fulfillment vendors;</li><li>Email, analytics, and marketing providers;</li><li>Professional advisors, and authorities where required by law.</li></ul><h2>Third-party websites and links</h2><p>Our site may link to third-party websites we do not operate or control. This policy does not apply to those sites, and we encourage you to review their privacy policies.</p><h2>Children's data</h2><p>Our site and products are intended for adults. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us and we will delete it.</p><h2>Security and retention of your information</h2><p>We use reasonable administrative, technical, and physical safeguards to protect your information, and we retain it for as long as needed to provide our services and meet legal, accounting, or reporting requirements. No method of transmission or storage is completely secure.</p><h2>Your rights</h2><p>Depending on where you live, you may have the right to access, correct, delete, or port your personal information, or to opt out of certain processing or marketing. You can unsubscribe from marketing email at any time using the link in our messages, or contact us to exercise your rights.</p><h2>Complaints</h2><p>If you have a concern about how we handle your information, please contact us first so we can help. You may also have the right to lodge a complaint with your local data protection authority.</p><h2>International users</h2><p>We are based in the United States and currently sell within the United States. If you access the site from outside the US, your information may be processed in the US, where privacy laws may differ from those in your location.</p><h2>Contact</h2><p>Fragrance Marketing Group, LLC<br>7925 Stone Creek Dr #130, Chanhassen, MN 55317<br><a href="mailto:jekelund@fragrancemarketinggroup.com">jekelund@fragrancemarketinggroup.com</a> · 952-466-7417</p>`,
);

const PAYMENT_TERMS = policy(
  "Payments",
  "Payment Terms",
  "July 26, 2026",
  "These Payment Terms describe how pricing, payment, and order acceptance work when you buy from Natural Inspirations, operated by Fragrance Marketing Group, LLC. They apply alongside our Terms of Service.",
  `<h2>Product pricing</h2><p>All prices are quoted in <strong>U.S. Dollars</strong> and are valid and effective only in the United States. Prices and availability are subject to change without notice. Wholesale distributors and retailers are not obligated to honor website pricing.</p><h2>Pricing errors</h2><p>We reserve the right to refuse or cancel any order for a product listed at an incorrect price, whether or not the order has been confirmed and your card charged. If your card has already been charged and we cancel the order, we will issue a credit promptly.</p><h2>Accepted payment methods</h2><p>We accept major credit and debit cards at checkout, including for wholesale orders. Payment is collected securely by our third-party payment processor; we do not store your full card details.</p><h2>When you're charged</h2><p>By submitting an order, you authorize us to charge your payment method for the total shown at checkout, including any applicable shipping and taxes. Your order is an offer to buy; a charge or order confirmation does not guarantee acceptance, and we may still cancel as described below.</p><h2>Taxes</h2><p>Applicable sales tax is calculated based on your shipping destination and added at checkout where required by law.</p><h2>Order acceptance</h2><p>Natural Inspirations reserves the right to refuse, cancel, or limit any order for any reason, including inventory limitations, pricing errors, or suspected fraud. We may request additional verification before accepting an order and will contact you if your order is cancelled or if we need more information.</p><h2>Contact</h2><p>Questions about a charge or payment? Reach us at <a href="mailto:hello@fragrancemarketinggroup.com">hello@fragrancemarketinggroup.com</a> or 952-466-7417.</p>`,
);

// ── registry ───────────────────────────────────────────────────────────────

const ANYWHERE: PageBlockType[] = ["rich_text", "quote", "image_text", "statement", "cta"];
const INFO: PageBlockType[] = ["seed_band", "checklist", "two_lists", "pillars", "link_cards", "faq", "philosophy", "newsletter", ...ANYWHERE];

export const NI_SITE_PAGES: SitePageDef[] = [
  {
    slug: "home",
    label: "Homepage",
    path: "/",
    group: "Main",
    note: "What shoppers see first. The hero and the collection panels fill themselves from the fragrance collections; signed-in wholesale buyers get the Wholesale homepage.",
    addable: ["value_strip", "seed_band", "two_lists", "checklist", "pillars", "link_cards", "newsletter", ...ANYWHERE],
    defaults: HOME,
  },
  {
    slug: "home-wholesale",
    label: "Wholesale homepage",
    path: "/ (signed-in wholesale)",
    group: "Main",
    note: "The homepage for signed-in wholesale buyers. Wrap a word in *stars* for the green italic.",
    addable: ["callout", ...ANYWHERE],
    defaults: HOME_WHOLESALE,
  },
  {
    slug: "product",
    label: "Product page template",
    path: "/products/…",
    group: "Shopping",
    note: "One layout for every product page. Product details are filled from each product in Products; the sections around them are set here and appear on every product.",
    addable: ["seed_band", "philosophy", "related_products", "checklist", "two_lists", ...ANYWHERE],
    defaults: PRODUCT,
  },
  {
    slug: "shop",
    label: "Shop all",
    path: "/shop",
    group: "Shopping",
    note: "The full product grid with filters. The grid itself fills automatically.",
    addable: ["newsletter", ...ANYWHERE],
    defaults: SHOP,
  },
  {
    slug: "collections",
    label: "Fragrance collections",
    path: "/collections",
    group: "Shopping",
    note: "The collection tiles fill themselves from the collections.",
    addable: ["newsletter", ...ANYWHERE],
    defaults: COLLECTIONS,
  },
  { slug: "story", label: "Our story", path: "/story", group: "About", note: "The brand story page.", addable: INFO, defaults: STORY },
  { slug: "exseed", label: "ExSeed®", path: "/exseed", group: "About", note: "The ExSeed® complex page.", addable: ["seed_cards", ...INFO], defaults: EXSEED },
  {
    slug: "ingredient-philosophy",
    label: "Ingredient philosophy",
    path: "/ingredient-philosophy",
    group: "Ingredients",
    note: "Indulge in the good, eliminate the bad.",
    addable: ["link_grid", ...INFO],
    defaults: INGREDIENT_PHILOSOPHY,
  },
  {
    slug: "ingredients",
    label: "Ingredient glossary",
    path: "/ingredients",
    group: "Ingredients",
    note: "The glossary itself (every ingredient, the ExSeed oils, common terms, what we never use) is reference data kept in the store's code.",
    addable: ["newsletter", ...ANYWHERE],
    defaults: INGREDIENTS,
  },
  {
    slug: "ingredients-by-product",
    label: "Ingredients by product",
    path: "/ingredients-by-product",
    group: "Ingredients",
    note: "The ingredient lists fill themselves from each product's label in Products.",
    addable: ["link_cards", "newsletter", ...ANYWHERE],
    defaults: INGREDIENTS_BY_PRODUCT,
  },
  { slug: "faq", label: "FAQ", path: "/faq", group: "Help", note: "Questions and answers, in sections.", addable: ["faq", "newsletter", ...ANYWHERE], defaults: FAQ },
  {
    slug: "blog",
    label: "Journal index",
    path: "/blog",
    group: "Help",
    note: "The list of journal posts. Posts themselves are written in Marketing → Blog Posts.",
    addable: ["newsletter", ...ANYWHERE],
    defaults: BLOG,
  },
  { slug: "contact", label: "Contact", path: "/contact", group: "Help", note: "The contact form page.", addable: [], fixed: true, defaults: CONTACT },
  { slug: "shipping", label: "Shipping", path: "/shipping", group: "Policies", note: "Shipping questions.", addable: ["faq", "rich_text"], defaults: SHIPPING },
  { slug: "returns", label: "Returns", path: "/returns", group: "Policies", note: "Returns questions.", addable: ["faq", "rich_text"], defaults: RETURNS },
  {
    slug: "payment-terms",
    label: "Payment terms",
    path: "/payment-terms",
    group: "Policies",
    note: "Policy page.",
    addable: [],
    fixed: true,
    defaults: PAYMENT_TERMS,
  },
  { slug: "terms", label: "Terms of service", path: "/terms", group: "Policies", note: "Policy page.", addable: [], fixed: true, defaults: TERMS },
  { slug: "privacy", label: "Privacy policy", path: "/privacy", group: "Policies", note: "Policy page.", addable: [], fixed: true, defaults: PRIVACY },
];

export function getNiSitePage(slug: string): SitePageDef | undefined {
  return NI_SITE_PAGES.find((p) => p.slug === slug);
}

/** Normalize an NI page (see normalizePageFor). Null for an unknown page or
 *  input that isn't an array. */
export function normalizeNiPage(slug: string, input: unknown): PageBlock[] | null {
  const page = getNiSitePage(slug);
  return page ? normalizePageFor(page, input) : null;
}

export function niDefaultBlocks(slug: string): PageBlock[] {
  return getNiSitePage(slug)?.defaults ?? [];
}

export function newNiPageBlock(type: PageBlockType, id: string): PageBlock {
  return newBlockFor(type, id, NI_SITE_PAGES);
}
