/**
 * The editable SASSY storefront pages, what each may contain, and their
 * defaults (the pages exactly as they were hand-coded, Oct 2026). NI's
 * pages live in pageDefaultsNi.ts.
 *
 * KEEP IN SYNC: byte-identical in fmg lib/site/ and store/sassy
 * src/lib/fmg/ — see pageBlocks.ts.
 */
import {
  newBlockFor,
  normalizePageFor,
  type HeroBlock,
  type PageBlock,
  type PageBlockType,
  type SitePageDef,
} from "./pageBlocks";

export type { SitePageDef };

export type SitePageSlug =
  | "home"
  | "home-wholesale"
  | "product"
  | "shop"
  | "story"
  | "blog"
  | "contact"
  | "shipping"
  | "returns"
  | "payment-terms"
  | "terms"
  | "privacy"
  | "quiz"
  | "site"
  | "theme";

// ── defaults ───────────────────────────────────────────────────────────────

const HOME: PageBlock[] = [
  {
    id: "hero",
    type: "hero",
    slides: [
      {
        id: "queen",
        name: "Queen",
        blurb: "Power moves + no apologies.",
        part: "123-00-02",
        accent: "#8B4FC7",
        desktopImage: "/queen/Queen_Header_1920x1067_01.jpg",
        mobileImage: "/queen/Queen_Image_1080x1080_01.jpg",
        persona: "queen",
      },
      {
        id: "bougie",
        name: "Bougie Babe",
        blurb: "Glam + luxe elegance.",
        part: "123-00-01",
        accent: "#E8488E",
        desktopImage: "/bougiebabe/Bougie-Babe_Header_1920x1067_01.jpg",
        mobileImage: "/bougiebabe/Bougie-Babe_Image_1080x1080_01.jpg",
        persona: "bougie",
      },
      {
        id: "bestie",
        name: "Bestie",
        blurb: "Love + all the tea.",
        part: "123-00-04",
        accent: "#E83A7A",
        desktopImage: "/bestie/Bestie_Header_1920x1067_01.jpg",
        mobileImage: "/bestie/Bestie_Image_1080x1080_01.jpg",
        persona: "bestie",
      },
      {
        id: "glowup",
        name: "Glow Up",
        blurb: "Sea salt citrus, infused with style.",
        part: "123-00-05",
        accent: "#E7488F",
        desktopImage: "/glowup/Glow-Up_Header_1920x1067_01.jpg",
        mobileImage: "/glowup/Glow-Up_Image_1080x1080_01.jpg",
        persona: "glowup",
      },
      {
        id: "fierce",
        name: "Fierce Vibes",
        blurb: "Hustle + unstoppable energy.",
        part: "123-00-07",
        accent: "#D44120",
        desktopImage: "/firecevibes/Fierce_Header_1920x1067_01.jpg",
        mobileImage: "/firecevibes/Fierce_Image_1080x1080_01.jpg",
        persona: "fierce",
      },
      {
        id: "hotmess",
        name: "Hot Mess",
        blurb: "Chaos + effortless charm.",
        part: "123-00-06",
        accent: "#E84A2C",
        desktopImage: "/hotmess/Hot-Mess_Header_1920x577_03.jpg",
        mobileImage: "/hotmess/Hot-Mess_Image_1080x1080_01.jpg",
        persona: "hotmess",
      },
    ],
  },
  {
    id: "values",
    type: "value_strip",
    items: ["Vegan & cruelty-free", "Made in small batches", "Scents that move on their own"],
  },
  {
    id: "bestsellers",
    type: "product_row",
    heading: "Bestsellers",
    linkLabel: "Shop all →",
    linkHref: "/shop",
    source: "bestsellers",
    parts: [],
    count: 4,
  },
  {
    id: "forms",
    type: "shop_by_form",
    heading: "Shop by form",
    linkLabel: "Shop all →",
    linkHref: "/shop",
    tiles: [
      {
        id: "hand",
        label: "Hand Crèmes",
        blurb: "The daily hydrator — six personalities deep.",
        shopType: "mini hand crème",
        match: "hand cr",
        image: "",
      },
      { id: "lip", label: "Lip Butters", blurb: "Same attitude, softer pout.", shopType: "lip butter", match: "lip", image: "" },
      {
        id: "gift",
        label: "Gift Sets",
        blurb: "Wrapped, ribboned, ready to hand over.",
        shopType: "gift set",
        match: "gift, set",
        image: "",
      },
    ],
  },
  {
    id: "newsletter",
    type: "newsletter",
    eyebrow: "join the group chat",
    heading: "get 15% off\nyour first order",
    body: "New drops, restocks, the occasional life update. Unsubscribing is allowed but emotionally devastating.",
    footnote: "retail orders only · wholesale has its own pricing",
  },
];

/** Kept for the homepage's first version of this file. */
export const DEFAULT_SASSY_HOME = HOME;
export const DEFAULT_HERO = HOME[0] as HeroBlock;

const HOME_WHOLESALE: PageBlock[] = [
  {
    id: "intro",
    type: "wholesale_intro",
    eyebrow: "spring / summer line sheet",
    title: "the wholesale program",
    lede: "Everything we make, priced by the case. Soft-skin merchandise that earns its shelf space — gift-ready packaging, vegan formulas, and scents that move on their own.",
    stats: [
      { id: "packs", label: "case packs", value: "12 / 24" },
      { id: "opening", label: "opening order", value: "$300" },
      { id: "terms", label: "payment terms", value: "credit card" },
      { id: "ship", label: "ship time", value: "3–5 days" },
    ],
  },
  { id: "catalog", type: "wholesale_catalog", heading: "current catalog", linkLabel: "full sheet →", count: 8 },
  {
    id: "rep",
    type: "callout",
    eyebrow: "your account rep",
    heading: "need a custom assortment?",
    html: `<p>Curated mixed cases, custom case packs and white-label gifting available for stockists above $5k / mo. Email <a href="mailto:jekelund@fragrancemarketinggroup.com">jekelund@fragrancemarketinggroup.com</a> and we’ll put a plan together.</p>`,
  },
];

const PRODUCT: PageBlock[] = [
  { id: "details", type: "product_details", trust: ["vegan + cruelty-free", "no sulfates or parabens", "made in small batches"] },
  {
    id: "benefits",
    type: "benefits_banner",
    heading: "hand crème benefits",
    formMatch: "hand cr",
    items: [
      { id: "b1", lead: "Hands so soft,", punch: "it's suspicious." },
      { id: "b2", lead: "Deep hydration that", punch: "actually lasts." },
      { id: "b3", lead: "Absorbs fast.", punch: "Feels expensive." },
      { id: "b4", lead: "Deep moisture that", punch: "doesn't quit." },
      { id: "b5", lead: "Rich hydration.", punch: "No grease." },
      { id: "b6", lead: "Because rough hands", punch: "aren't it." },
    ],
  },
  {
    id: "philosophy",
    type: "philosophy",
    columns: [
      {
        id: "ingredients",
        eyebrow: "let's clear something up",
        heading: "“natural” doesn't have to mean basic.",
        intro: "Your skin deserves better than mystery ingredients and mile-long labels.",
        subheading: "We're picky about our ingredients.",
        body: `<p>At Sassy + Co™, our formulations are built on high-performance plant ingredients that actually do something for your skin. We start with nutrient-rich botanical oils, antioxidant-packed seed oils, and skin-loving humectants and emollients that help hydrate, soften, and support your skin's natural barrier.</p><p>Think essential fatty acids, vitamins, and protective antioxidants—the good stuff your skin already knows how to use.</p><p>But great skincare should smell as good as it feels. That's why every Sassy formula is finished with a crave-worthy fragrance designed to elevate your mood, match your vibe, and make your everyday routine feel a little more indulgent.</p>`,
        pullQuote: "Because skincare should work hard, feel luxurious + smell absolutely fabulous.",
      },
      {
        id: "philosophy",
        eyebrow: "the philosophy",
        heading: "Baddies without the bad stuff.",
        intro:
          "We don't load our formulas with fillers, unnecessary fluff, or ingredients that sound impressive but don't do much. Instead, we focus on thoughtfully chosen plant ingredients that deliver real results and beautiful textures.",
        subheading: "",
        body: "",
        pullQuote: "",
      },
    ],
  },
  { id: "related", type: "related_products", heading: "pairs well with", wholesaleHeading: "round out the order" },
  {
    id: "reviews",
    type: "reviews_note",
    eyebrow: "what the group chat says",
    heading: "reviews are coming soon",
    message: "Real reviews are on the way. Once you've put it to work, you'll get to weigh in — loud opinions encouraged.",
  },
];

const SHOP: PageBlock[] = [
  {
    id: "header",
    type: "page_header",
    eyebrow: "the whole lineup",
    title: "shop all",
    lede: "Every scent. Every ingredient that pulls its weight. Every excuse to add one more thing to the bag. You can't shop them all (but you can try).",
    wholesaleEyebrow: "wholesale line sheet",
    wholesaleTitle: "line sheet",
    wholesaleLede: "Every product, every case price. MOQ is 1 case per item. Minimum opening order $300, reorders $300.",
  },
  { id: "catalog", type: "catalog" },
  { ...(HOME[4] as PageBlock), id: "newsletter" },
];

const BLOG: PageBlock[] = [
  {
    id: "header",
    type: "page_header",
    eyebrow: "the journal",
    title: "the blog",
    lede: "Soft-skin tips, scent stories, and loud opinions — fresh from the lab.",
    wholesaleEyebrow: "",
    wholesaleTitle: "",
    wholesaleLede: "",
  },
  { id: "catalog", type: "catalog" },
];

const STORY: PageBlock[] = [
  {
    id: "header",
    type: "article_header",
    kicker: "How we got here",
    title: "47,000 tubes.",
    titleAccent: "One big idea.",
    tags: ["Playful", "Confident", "Giftable"],
  },
  { id: "cover", type: "story_cover", frames: [
    {
      "id": "bougie-babe",
      "name": "Bougie Babe",
      "image": "/bougiebabe/Bougie-Babe_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-bougie-babe"
    },
    {
      "id": "bestie",
      "name": "Bestie",
      "image": "/bestie/Bestie_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-bestie"
    },
    {
      "id": "queen",
      "name": "Queen",
      "image": "/queen/Queen_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-queen"
    },
    {
      "id": "glow-up",
      "name": "Glow Up",
      "image": "/glowup/Glow-Up_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-glow-up"
    },
    {
      "id": "hot-mess",
      "name": "Hot Mess",
      "image": "/hotmess/Hot-Mess_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-hot-mess"
    },
    {
      "id": "fierce-vibes",
      "name": "Fierce Vibes",
      "image": "/firecevibes/Fierce_Header_1920x1067_01.jpg",
      "href": "/blog/meet-the-fierce-vibes"
    }
  ] },
  {
    id: "intro",
    type: "rich_text",
    html: `<p>One vacation, a candle display in Breckenridge, and a warehouse full of empty hand crème tubes. Here’s how Sassy + Co. began.</p>`,
  },
  {
    id: "stats",
    type: "stats",
    items: [
      { id: "tubes", value: "47,000", label: "Empty tubes, waiting for a purpose" },
      { id: "display", value: "1", label: "Candle display in Breckenridge" },
      { id: "personalities", value: "6", label: "Personalities, zero filler" },
    ],
  },
  { id: "quote1", type: "quote", eyebrow: "", text: "We don’t make hand crème.", highlight: "We make personalities.", footnote: "" },
  {
    id: "body",
    type: "rich_text",
    html: `<p>Because most of us are all of them at different times. Some days you’re a Queen. Some days you’re a Hot Mess. Some days you’re both before noon.</p><h2>It started in a candle shop.</h2><p>A few years ago I was wandering a quirky little shop in Breckenridge, Colorado when I stopped dead in my tracks. It wasn’t the candles. It was the attitude. Bold names, hilarious messages. People weren’t buying candles, they were buying a feeling.</p><h2>Back home: 47,000 empty tubes.</h2><p>A warehouse full of hand crème tubes, waiting for a purpose. What if we made something that wasn’t just another bath-and-body product? What if the products felt like the people who used them?</p><h2>So we built a cast.</h2><p>I called my daughter Brooke, our Creative Director and resident trend-spotter, and the brainstorming began. We laughed. We debated. We tested names on friends, family, and the sales team. Eventually, a cast of characters emerged.</p>`,
  },
  {
    id: "cast",
    type: "link_list",
    heading: "Meet the cast.",
    subheading: "Not just product names",
    items: [
      { id: "hotmess", label: "Hot Mess", note: "Chaos, effortless charm", href: "/blog/meet-the-hot-mess" },
      { id: "queen", label: "Queen", note: "Power moves, no apologies", href: "/blog/meet-the-queen" },
      { id: "bougie", label: "Bougie Babe", note: "Glam, luxe elegance", href: "/blog/meet-the-bougie-babe" },
      { id: "bestie", label: "Bestie", note: "Love, and all the tea", href: "/blog/meet-the-bestie" },
      { id: "glowup", label: "Glow Up", note: "Main-character energy", href: "/blog/meet-the-glow-up" },
      { id: "fierce", label: "Fierce Vibes", note: "Hustle, unstoppable", href: "/blog/meet-the-fierce-vibes" },
    ],
  },
  {
    id: "journal",
    type: "rich_text",
    html: `<p>Read every character’s story in <a href="/blog">the journal</a>. Plus a rotating cast in our seasonal drops, because life keeps adding characters.</p>`,
  },
  {
    id: "promise",
    type: "quote",
    eyebrow: "The promise",
    text: "Every fragrance, every label, every collection is built to make you smile, feel seen, and laugh when you need it most.",
    highlight: "",
    footnote: "Playful. Confident. Giftable.",
  },
  {
    id: "closing",
    type: "cta",
    heading: "Life is too short for boring hand crème.",
    primaryLabel: "Shop the lineup",
    primaryHref: "/shop",
    secondaryLabel: "Say hi →",
    secondaryHref: "/contact",
  },
];

const CONTACT: PageBlock[] = [
  {
    id: "header",
    type: "page_header",
    eyebrow: "get in touch",
    title: "drop us a line",
    lede: "We read every email, every dm, every form. Expect a reply within a business day from a real human who probably has too much body crème on her hands.",
    wholesaleEyebrow: "",
    wholesaleTitle: "",
    wholesaleLede: "",
  },
  { id: "form", type: "contact_form", heading: "tell us what’s up", subheading: "The more detail, the better the reply." },
  {
    id: "cards",
    type: "info_cards",
    cards: [
      {
        id: "hours",
        tone: "blush",
        label: "hours",
        title: "We reply as fast as we can",
        body: "We try to get back to everyone at all times — weekends might just be a little slower.",
        email: "",
        phone: "",
        details: "",
        linkLabel: "",
        linkHref: "",
      },
      {
        id: "press",
        tone: "ink",
        label: "press & wholesale",
        title: "",
        body: "Stockists, PR samples, line sheets:",
        email: "jekelund@fragrancemarketinggroup.com",
        phone: "",
        details: "",
        linkLabel: "",
        linkHref: "",
      },
    ],
  },
];

function policy(
  eyebrow: string,
  title: string,
  lede: string,
  highlight: [string, string, string],
  help: string,
  html: string,
): PageBlock[] {
  return [
    {
      id: "policy",
      type: "policy",
      eyebrow,
      title,
      lede,
      highlightLabel: highlight[0],
      highlightTitle: highlight[1],
      highlightBody: highlight[2],
      help,
      html,
    },
  ];
}

const SHIPPING = policy(
  "The logistics, lovingly",
  "Shipping",
  "Flat $8.95, free once you cross $50. Fast enough that you won't have time to miss it.",
  ["the short version", "Free shipping over $50", "Ships in 1–2 business days, arrives 3–5 business days later. US only for now."],
  "Wrong address, stuck tracking, box that lost a fight?",
  `<h2>How much is shipping?</h2><p>Flat $8.95 anywhere in the US. Cross $50 and it's free — the announcement bar wasn't kidding.</p><h2>When does it ship?</h2><p>Orders leave the lab within 1–2 business days. Once it's with the carrier, plan on 3–5 business days door to door.</p><h2>Do I get tracking?</h2><p>Obviously. A tracking link lands in your inbox the second the label prints. Refresh responsibly.</p><h2>Do you ship internationally?</h2><p>US only for now. We're working on it — join the newsletter and you'll know the minute we cross a border.</p><h2>What about wholesale orders?</h2><p>Case orders ship in 3–5 business days with credit card billing on every order. Details live in the wholesale portal.</p>`,
);

const RETURNS = policy(
  "No hard feelings",
  "Returns",
  "Not feeling it? You have 30 days. We'll handle the rest like the customer-service overachievers we are.",
  ["the short version", "30 days, no drama", "Unopened and unused, prepaid label on us, refund within 5–10 business days of it landing back."],
  "Edge case, gift situation, “it’s complicated”?",
  `<h2>The window</h2><p>30 days from delivery. Unopened and unused — we're a skincare brand, hygiene wins every argument.</p><h2>How to start one</h2><p>Email <a href="mailto:hello@sassyandco.com">hello@sassyandco.com</a> or use the contact form with your order number. We'll send a prepaid label and zero guilt trips.</p><h2>The refund</h2><p>Back to your original payment method within 5–10 business days of the box landing back with us. Original shipping isn't refundable.</p><h2>Gift sets</h2><p>Returnable like everything else — but the whole set comes back together. No keeping the best tube and returning its friends.</p><h2>Arrived damaged?</h2><p>That's on us, not you. Send a photo within 7 days and we'll replace it — no need to mail back the casualty.</p><h2>Wholesale orders</h2><p>Different rules, real human: damages and shortages go through your account rep within 7 days of receipt.</p>`,
);

const PAYMENT_TERMS = policy(
  "Payments",
  "Payment Terms",
  "These Payment Terms describe how pricing, payment, and order acceptance work when you buy from Sassy, operated by Fragrance Marketing Group, LLC. They apply alongside our Terms of Service.",
  ["last updated", "July 26, 2026", "Prices in USD, major cards accepted, sales tax added at checkout where required."],
  "Questions about this policy?",
  `<h2>Product pricing</h2><p>All prices are quoted in <strong>U.S. Dollars</strong> and are valid and effective only in the United States. Prices and availability are subject to change without notice. Wholesale distributors and retailers are not obligated to honor website pricing.</p><h2>Pricing errors</h2><p>We reserve the right to refuse or cancel any order for a product listed at an incorrect price, whether or not the order has been confirmed and your card charged. If your card has already been charged and we cancel the order, we will issue a credit promptly.</p><h2>Accepted payment methods</h2><p>We accept major credit and debit cards at checkout, including for wholesale orders. Payment is collected securely by our third-party payment processor; we do not store your full card details.</p><h2>When you're charged</h2><p>By submitting an order, you authorize us to charge your payment method for the total shown at checkout, including any applicable shipping and taxes. Your order is an offer to buy; a charge or order confirmation does not guarantee acceptance, and we may still cancel as described below.</p><h2>Taxes</h2><p>Applicable sales tax is calculated based on your shipping destination and added at checkout where required by law.</p><h2>Order acceptance</h2><p>Sassy reserves the right to refuse, cancel, or limit any order for any reason, including inventory limitations, pricing errors, or suspected fraud. We may request additional verification before accepting an order and will contact you if your order is cancelled or if we need more information.</p><h2>Contact</h2><p>Questions about a charge or payment? Reach us at <a href="mailto:hello@sassyandco.com">hello@sassyandco.com</a> or 952-466-7417.</p>`,
);

const TERMS = policy(
  "The fine print",
  "Terms of Service",
  `These Terms & Conditions govern your access to and use of the Sassy website and your purchases from it. The website is operated by Fragrance Marketing Group, LLC ("Company," "we," "us"). By using the site or placing an order, you agree to these terms.`,
  ["last updated", "July 26, 2026", "If anything changes, we’ll post it here and bump this date."],
  "Questions about this policy?",
  `<h2>Permitted use &amp; limited license</h2><p>You may access and view the content on this website for personal, non-commercial purposes only. The website and all information and materials contained herein are and shall remain the property of the Company. You may not modify, copy, distribute, republish, or commercially exploit any material without our prior written permission.</p><h2>Copyrights &amp; trademarks</h2><p>All content on this site — including text, graphics, logos, product photography, and our product names and formulations — is owned by or licensed to the Company and protected by intellectual property laws. Reproduction or the creation of derivative works is prohibited without written permission.</p><h2>Acceptable use</h2><p>You agree not to use the website to post or transmit unlawful, threatening, or defamatory content; distribute malware; send spam; impersonate others; attempt to gain unauthorized access to our systems; or otherwise exploit the site commercially without authorization.</p><h2>Product availability &amp; pricing</h2><p>Prices and availability of the products listed on the website are subject to change without notice. We make every effort to display accurate information, but errors can occur. If a product is mispriced, we reserve the right to cancel the order without penalty; if your card has already been charged for a cancelled order, we will issue a credit promptly.</p><h2>Order acceptance</h2><p>We reserve the right to refuse, cancel, or limit any order for any reason — including inventory limitations, pricing errors, or suspected fraud — and to require additional verification before accepting an order. We will contact you if your order is cancelled or if we need more information.</p><h2>Shipping &amp; returns</h2><p>Shipping and returns are governed by our separate <a href="/shipping">Shipping Policy</a> and <a href="/returns">Returns Policy</a>, which you should review before purchasing. Payment terms are described in our <a href="/payment-terms">Payment Terms</a>.</p><h2>User submissions</h2><p>Any content you submit to us through the website (such as reviews, messages, or ideas) grants the Company a perpetual, worldwide, royalty-free license to use, reproduce, and display that content for any purpose. Do not submit anything you are not entitled to share.</p><h2>Disclaimer</h2><p>The website and its content are provided on an <strong>“as is”</strong> and <strong>“as available”</strong> basis. To the fullest extent permitted by law, the Company disclaims all warranties, express or implied, regarding the accuracy, reliability, or availability of the site, and does not warrant that it will be uninterrupted or error-free. Our products are cosmetics, not medical treatments; nothing on the site is intended as medical advice.</p><h2>Limitation of liability</h2><p>To the fullest extent permitted by law, in no event shall the Company or any affiliated entity be liable for any lost profits, lost data, or any special, incidental, indirect, or consequential damages arising out of or related to your use of the website or products.</p><h2>Privacy</h2><p>Your use of the website is also governed by our <a href="/privacy">Privacy Policy</a>, which is incorporated into these terms by reference.</p><h2>Copyright complaints (DMCA)</h2><p>If you believe content on this site infringes your copyright, please contact our Copyright Agent: Fragrance Marketing Group, LLC Legal Department, 7925 Stone Creek Dr #130, Chanhassen, MN 55317; 952-466-7417.</p><h2>Governing law</h2><p>These terms are governed by the laws of the State of Minnesota, without regard to its conflict-of-laws rules. You agree to the exclusive jurisdiction and venue of the state and federal courts located in Minnesota.</p><h2>Contact</h2><p>Fragrance Marketing Group, LLC<br>7925 Stone Creek Dr #130, Chanhassen, MN 55317<br><a href="mailto:hello@sassyandco.com">hello@sassyandco.com</a> · 952-466-7417</p>`,
);

const PRIVACY = policy(
  "Your privacy",
  "Privacy Policy",
  `This Privacy Policy explains how Fragrance Marketing Group, LLC, which operates Sassy ("we," "us"), collects, uses, and discloses your personal information when you visit our website, place an order, or otherwise interact with us.`,
  ["last updated", "August 2, 2026", "We don’t sell your data, and we honor Global Privacy Control. If anything changes, we’ll post it here and bump this date."],
  "Questions about this policy?",
  `<h2>Changes to this privacy policy</h2><p>We may update this policy from time to time to reflect changes to our practices or for legal reasons. We will post the revised policy here and update the “last updated” date above.</p><h2>How we collect and use your personal information</h2><p>We collect information you provide directly, information collected automatically as you use the site, and information from vendors and service providers. This may include:</p><ul><li><strong>Contact details</strong> — name, shipping and billing address, phone number, and email address.</li><li><strong>Order and account information</strong> — items purchased, order history, and wholesale account details.</li><li><strong>Payment information</strong> — processed securely by our third-party payment processors; we do not store full card numbers.</li><li><strong>Usage data</strong> — collected through cookies and similar technologies when you browse the site.</li></ul><p>We use this information to:</p><ul><li>Fulfill and ship your orders and provide customer support;</li><li>Send marketing and transactional communications you've agreed to;</li><li>Detect fraud and keep our site and customers secure;</li><li>Improve our products, services, and website.</li></ul><h2>Cookies, analytics, and your choices</h2><p>We use cookies and similar technologies — including your browser's local storage — to operate the site, keep you signed in, and remember your cart. Our website analytics are first-party: we measure how the site is used with our own tools and do not load third-party advertising trackers or share your browsing with ad networks.</p><p>We honor the <strong>Global Privacy Control (GPC)</strong> browser signal as a valid opt-out of analytics, as well as the older Do Not Track setting. When your browser sends either signal, we do not record site-usage analytics for that visit. You can also control cookies through your browser settings; disabling some may affect how the site works.</p><h2>How we disclose personal information</h2><p>We do not sell your personal information, and we do not share it for cross-context behavioral advertising (as those terms are defined under California and other state privacy laws). We share it only as needed with service providers who help us run our business, including:</p><ul><li>Hosting and infrastructure providers;</li><li>Payment processors;</li><li>Shipping carriers and fulfillment vendors;</li><li>Email, analytics, and marketing providers;</li><li>Professional advisors, and authorities where required by law.</li></ul><h2>Third-party websites and links</h2><p>Our site may link to third-party websites we do not operate or control. This policy does not apply to those sites, and we encourage you to review their privacy policies.</p><h2>Children's data</h2><p>Our site and products are intended for adults. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us and we will delete it.</p><h2>Security and retention of your information</h2><p>We use reasonable administrative, technical, and physical safeguards to protect your information, and we retain it for as long as needed to provide our services and meet legal, accounting, or reporting requirements. No method of transmission or storage is completely secure.</p><h2>Your privacy rights</h2><p>Depending on where you live — including California, Minnesota, New Jersey, Colorado, Connecticut, Virginia, and other states with comprehensive privacy laws — you may have some or all of the following rights regarding the personal information we hold about you:</p><ul><li><strong>Know and access</strong> — request the categories and specific pieces of personal information we have collected about you;</li><li><strong>Correct</strong> — ask us to fix inaccurate personal information;</li><li><strong>Delete</strong> — ask us to delete personal information we collected from you, subject to legal exceptions;</li><li><strong>Portability</strong> — receive a copy of your information in a portable format;</li><li><strong>Opt out</strong> — opt out of targeted advertising, the sale of personal information, and certain profiling. As noted above, we do not sell or share your personal information for cross-context behavioral advertising; and</li><li><strong>Non-discrimination</strong> — we will not deny you goods or services, or charge you a different price, for exercising these rights.</li></ul><p>We extend these rights to all of our customers regardless of their state of residence. To exercise any of them, or to unsubscribe from marketing email, contact us using the details below; we will verify your request and respond within the timeframe your state's law requires. You may also use an authorized agent where the law allows. If we decline a request, you may appeal by replying to our response, and — for California residents — you may also contact the California Privacy Protection Agency or Attorney General.</p><p><strong>Opt-out preference signals.</strong> We treat the Global Privacy Control (GPC) signal sent by your browser as a valid request to opt out of analytics on that browser. See “Cookies, analytics, and your choices” above.</p><h2>Complaints</h2><p>If you have a concern about how we handle your information, please contact us first so we can help. You may also have the right to lodge a complaint with your local data protection authority.</p><h2>International users</h2><p>We are based in the United States and currently sell within the United States. If you access the site from outside the US, your information may be processed in the US, where privacy laws may differ from those in your location.</p><h2>Contact</h2><p>Fragrance Marketing Group, LLC<br>7925 Stone Creek Dr #130, Chanhassen, MN 55317<br><a href="mailto:jekelund@fragrancemarketinggroup.com">jekelund@fragrancemarketinggroup.com</a> · 952-466-7417</p>`,
);

const QUIZ: PageBlock[] = [{
    "id": "quiz",
    "type": "quiz",
    "cardLabel": "find your sassy",
    "personas": [
      {
        "key": "queen",
        "name": "Queen",
        "tag": "Power moves, no apologies.",
        "scent": "Lavender Ylang",
        "crown": "You don't chase, you attract. You don't argue, you decide. Kneel first, then moisturize.",
        "part": "123-00-02",
        "slug": "meet-the-queen",
        "image": "/queen/Queen_Image_1080x1080_01.jpg",
        "surface": "#F4ECFA",
        "ink": "#2D1140",
        "accent": "#7C3FB3",
        "accentInk": "#FFFFFF"
      },
      {
        "key": "bougie",
        "name": "Bougie Babe",
        "tag": "Glam, luxe, unbothered.",
        "scent": "Eucalyptus Mint",
        "crown": "Too glam to give a damn, still perfectly hydrated. You know what you like, and you're usually right.",
        "part": "123-00-01",
        "slug": "meet-the-bougie-babe",
        "image": "/bougiebabe/Bougie-Babe_Image_1080x1080_01.jpg",
        "surface": "#D8E150",
        "ink": "#2F3D00",
        "accent": "#E8488E",
        "accentInk": "#FFFFFF"
      },
      {
        "key": "bestie",
        "name": "Bestie",
        "tag": "Love, snacks, and all the tea.",
        "scent": "Grapefruit Bergamot",
        "crown": "You brought the snacks AND the tea. Warm, close, a little too honest, and never going anywhere.",
        "part": "123-00-04",
        "slug": "meet-the-bestie",
        "image": "/bestie/Bestie_Image_1080x1080_01.jpg",
        "surface": "#FBD3D9",
        "ink": "#4A0F2E",
        "accent": "#E83A7A",
        "accentInk": "#FFFFFF"
      },
      {
        "key": "glowup",
        "name": "Glow Up",
        "tag": "Sea salt citrus, main-character energy.",
        "scent": "Sea Salt Citrus",
        "crown": "Same girl, plot twist. You didn't get a new face, you got a new era, and everyone noticed.",
        "part": "123-00-05",
        "slug": "meet-the-glow-up",
        "image": "/glowup/Glow-Up_Image_1080x1080_01.jpg",
        "surface": "#FEF0A8",
        "ink": "#4A1800",
        "accent": "#E7488F",
        "accentInk": "#FFFFFF"
      },
      {
        "key": "fierce",
        "name": "Fierce Vibes",
        "tag": "Hustle, unstoppable energy.",
        "scent": "Agave Pear",
        "crown": "No sleep, no signal, no chill, and you still ran the entire room. Run on empty, then moisturize.",
        "part": "123-00-07",
        "slug": "meet-the-fierce-vibes",
        "image": "/firecevibes/Fierce_Image_1080x1080_01.jpg",
        "surface": "#FFD8B4",
        "ink": "#3A1500",
        "accent": "#D44120",
        "accentInk": "#FFFFFF"
      },
      {
        "key": "hotmess",
        "name": "Hot Mess",
        "tag": "Chaos, charm, zero plan.",
        "scent": "Coconut Vanilla",
        "crown": "4% battery, no plan, best night in the group chat. Lose the keys, keep the glow.",
        "part": "123-00-06",
        "slug": "meet-the-hot-mess",
        "image": "/hotmess/Hot-Mess_Image_1080x1080_01.jpg",
        "surface": "#FFE2D3",
        "ink": "#4A1500",
        "accent": "#E84A2C",
        "accentInk": "#FFFFFF"
      }
    ],
    "questions": [
      {
        "id": "q1",
        "prompt": "It's Friday night. Where are you, really?",
        "options": [
          {
            "id": "q1o1",
            "label": "Front row, flash on, being seen",
            "weights": {
              "glowup": 2,
              "bougie": 1
            }
          },
          {
            "id": "q1o2",
            "label": "Hosting — snacks out, group chat summoned",
            "weights": {
              "bestie": 2,
              "hotmess": 1
            }
          },
          {
            "id": "q1o3",
            "label": "Closing a deal from the corner booth",
            "weights": {
              "fierce": 2,
              "queen": 1
            }
          },
          {
            "id": "q1o4",
            "label": "Good robe, candle lit, phone face-down",
            "weights": {
              "bougie": 2,
              "queen": 1
            }
          }
        ]
      },
      {
        "id": "q2",
        "prompt": "Pick the energy you bring to a room.",
        "options": [
          {
            "id": "q2o1",
            "label": "Calm, in charge, unbothered",
            "weights": {
              "queen": 2,
              "bougie": 1
            }
          },
          {
            "id": "q2o2",
            "label": "Loud, warm, all the way in",
            "weights": {
              "bestie": 2,
              "hotmess": 1
            }
          },
          {
            "id": "q2o3",
            "label": "Go-go-go, to-do list on fire",
            "weights": {
              "fierce": 2,
              "glowup": 1
            }
          },
          {
            "id": "q2o4",
            "label": "Main character, glow on",
            "weights": {
              "glowup": 2,
              "bougie": 1
            }
          }
        ]
      },
      {
        "id": "q3",
        "prompt": "The group chat calls you the one who…",
        "options": [
          {
            "id": "q3o1",
            "label": "…has the plan and the receipts",
            "weights": {
              "queen": 2,
              "fierce": 1
            }
          },
          {
            "id": "q3o2",
            "label": "…brings the snacks and the tea",
            "weights": {
              "bestie": 2
            }
          },
          {
            "id": "q3o3",
            "label": "…is 20 min late with the best story",
            "weights": {
              "hotmess": 2,
              "glowup": 1
            }
          },
          {
            "id": "q3o4",
            "label": "…quietly upgraded everyone's whole life",
            "weights": {
              "bougie": 2
            }
          }
        ]
      },
      {
        "id": "q4",
        "prompt": "Everything just went sideways. What's the move?",
        "options": [
          {
            "id": "q4o1",
            "label": "Handle it. Calmly. Next.",
            "weights": {
              "queen": 2,
              "bougie": 1
            }
          },
          {
            "id": "q4o2",
            "label": "Push through now, sleep later",
            "weights": {
              "fierce": 2,
              "glowup": 1
            }
          },
          {
            "id": "q4o3",
            "label": "Laugh, spiral a little, survive",
            "weights": {
              "hotmess": 2,
              "glowup": 1
            }
          },
          {
            "id": "q4o4",
            "label": "Summon the group chat immediately",
            "weights": {
              "bestie": 2,
              "hotmess": 1
            }
          }
        ]
      },
      {
        "id": "q5",
        "prompt": "Real talk: what actually seals the deal?",
        "options": [
          {
            "id": "q5o1",
            "label": "The name and the attitude",
            "weights": {
              "queen": 1,
              "bougie": 1
            }
          },
          {
            "id": "q5o2",
            "label": "How soft it leaves my hands",
            "weights": {
              "bestie": 1,
              "fierce": 1
            }
          },
          {
            "id": "q5o3",
            "label": "The whole aesthetic and packaging",
            "weights": {
              "glowup": 1,
              "bougie": 1
            }
          },
          {
            "id": "q5o4",
            "label": "The SCENT — I choose by fragrance alone",
            "weights": {
              "glowup": 1
            }
          }
        ]
      }
    ],
    "scentPrompt": "Then pick your scent — this one's the tiebreaker.",
    "scentOptions": [
      {
        "id": "scent1",
        "label": "Sea Salt Citrus",
        "persona": "glowup"
      },
      {
        "id": "scent2",
        "label": "Lavender Ylang",
        "persona": "queen"
      },
      {
        "id": "scent3",
        "label": "Eucalyptus Mint",
        "persona": "bougie"
      },
      {
        "id": "scent4",
        "label": "Grapefruit Bergamot",
        "persona": "bestie"
      },
      {
        "id": "scent5",
        "label": "Coconut Vanilla",
        "persona": "hotmess"
      },
      {
        "id": "scent6",
        "label": "Agave Pear",
        "persona": "fierce"
      }
    ]
  }];

const SITE: PageBlock[] = [
    {
      "id": "announcement",
      "type": "announcement",
      "retail": [
        "free shipping when you cross $50",
        "15% off the first one — you'll know what to do",
        "soft skin, big mood — the whole lineup's in."
      ],
      "wholesale": [
        "credit card billing at checkout",
        "ships in 3–5 business days",
        "minimum opening order $300"
      ]
    },
    {
      "id": "footer",
      "type": "footer",
      "tagline": "Soft skin. Big mood. Self care with the volume turned up.",
      "subscribeEyebrow": "",
      "subscribeText": "",
      "columns": [
        {
          "id": "shop",
          "heading": "shop",
          "links": [
            {
              "id": "all",
              "label": "Shop All",
              "href": "/shop"
            },
            {
              "id": "everyday",
              "label": "Everyday",
              "href": "/collections/everyday"
            },
            {
              "id": "love",
              "label": "Love",
              "href": "/collections/love"
            },
            {
              "id": "holiday",
              "label": "Holiday",
              "href": "/collections/holiday"
            },
            {
              "id": "order",
              "label": "Find My Order",
              "href": "/order"
            }
          ]
        },
        {
          "id": "company",
          "heading": "company",
          "links": [
            {
              "id": "story",
              "label": "Our Story",
              "href": "/story"
            },
            {
              "id": "blog",
              "label": "The Blog",
              "href": "/blog"
            },
            {
              "id": "wholesale",
              "label": "Wholesale",
              "href": "/wholesale"
            },
            {
              "id": "contact",
              "label": "Contact",
              "href": "/contact"
            }
          ]
        },
        {
          "id": "fine",
          "heading": "the fine print",
          "links": [
            {
              "id": "shipping",
              "label": "Shipping",
              "href": "/shipping"
            },
            {
              "id": "returns",
              "label": "Returns",
              "href": "/returns"
            },
            {
              "id": "payment",
              "label": "Payment Terms",
              "href": "/payment-terms"
            },
            {
              "id": "terms",
              "label": "Terms of Service",
              "href": "/terms"
            },
            {
              "id": "privacy",
              "label": "Privacy Policy",
              "href": "/privacy"
            }
          ]
        }
      ],
      "sisterEyebrow": "the calm to our chaos",
      "sisterName": "Natural Inspirations",
      "sisterHref": "https://naturalinspirations.com",
      "sisterBlurb": "spa-inspired body & skincare. same lab, same standards, volume turned all the way down.",
      "copyright": "© {year} sassy & co — made with attitude"
    }
  ];

// ── registry ───────────────────────────────────────────────────────────────

const ANYWHERE: PageBlockType[] = ["promo_banner", "image_text", "rich_text", "quote"];

export const SITE_PAGES: SitePageDef[] = [
  {
    slug: "home",
    label: "Homepage",
    path: "/",
    group: "Main",
    note: "What shoppers see first. Signed-in wholesale buyers get the Wholesale homepage instead.",
    addable: ["value_strip", "product_row", "shop_by_form", "newsletter", "stats", "cta", ...ANYWHERE],
    defaults: HOME,
  },
  {
    slug: "home-wholesale",
    label: "Wholesale homepage",
    path: "/ (signed-in wholesale)",
    group: "Main",
    note: "The homepage for signed-in wholesale buyers.",
    addable: ["callout", ...ANYWHERE],
    defaults: HOME_WHOLESALE,
  },
  {
    slug: "product",
    label: "Product page template",
    path: "/products/…",
    group: "Shopping",
    note: "One layout for every product page. Product details are filled from each product in Products; the sections around them are set here and appear on every product.",
    addable: ["benefits_banner", "philosophy", "related_products", "reviews_note", ...ANYWHERE],
    defaults: PRODUCT,
  },
  {
    slug: "shop",
    label: "Shop all",
    path: "/shop",
    group: "Shopping",
    note: "The full product grid with filters. The grid itself fills automatically.",
    addable: ["newsletter", "cta", ...ANYWHERE],
    defaults: SHOP,
  },
  {
    slug: "story",
    label: "Our story",
    path: "/story",
    group: "About",
    note: "The brand story page.",
    addable: ["stats", "link_list", "cta", ...ANYWHERE],
    defaults: STORY,
  },
  {
    slug: "blog",
    label: "Blog index",
    path: "/blog",
    group: "About",
    note: "The list of blog posts. Posts themselves are written in Marketing → Blog Posts.",
    addable: ["newsletter", "cta", ...ANYWHERE],
    defaults: BLOG,
  },
  {
    slug: "contact",
    label: "Contact",
    path: "/contact",
    group: "About",
    note: "The contact form page.",
    addable: [],
    fixed: true,
    defaults: CONTACT,
  },
  { slug: "shipping", label: "Shipping", path: "/shipping", group: "Policies", note: "Policy page.", addable: [], fixed: true, defaults: SHIPPING },
  { slug: "returns", label: "Returns", path: "/returns", group: "Policies", note: "Policy page.", addable: [], fixed: true, defaults: RETURNS },
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
  {
    slug: "quiz",
    label: "Find your Sassy quiz",
    path: "/quiz",
    group: "Site-wide",
    note: "One quiz, three places: the homepage quiz card, /quiz and the chat assistant. Edit the words, the scoring and each persona's result here.",
    addable: [],
    fixed: true,
    defaults: QUIZ,
  },
  {
    slug: "site",
    label: "Header & footer",
    path: " (every page)",
    group: "Site-wide",
    note: "The announcement bar and the footer, on every page of the site.",
    addable: [],
    fixed: true,
    defaults: SITE,
  },
  {
    slug: "theme",
    label: "Colors",
    path: " (every page)",
    group: "Site-wide",
    note: "The site's colors. Each one is used all over the site — change it here and every page follows. To recolor just one block, use the Colors section of that block instead.",
    addable: [],
    fixed: true,
    defaults: [{ id: "theme", type: "theme", palette: {} }],
  },
];

export function getSitePage(slug: string): SitePageDef | undefined {
  return SITE_PAGES.find((p) => p.slug === slug);
}

/** Normalize a Sassy page (see normalizePageFor). Null for an unknown page
 *  or input that isn't an array. */
export function normalizePage(slug: string, input: unknown): PageBlock[] | null {
  const page = getSitePage(slug);
  return page ? normalizePageFor(page, input) : null;
}

/** The default blocks of a page (for "start over" and fallbacks). */
export function defaultBlocks(slug: string): PageBlock[] {
  return getSitePage(slug)?.defaults ?? [];
}

/** A fresh block of `type` for the editor's "Add block" menu. */
export function newPageBlock(type: PageBlockType, id: string): PageBlock {
  return newBlockFor(type, id, SITE_PAGES);
}
