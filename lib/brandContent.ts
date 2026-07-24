/**
 * Brand positioning content — the words reps and internal staff use to sell.
 *
 * Lives here rather than in the internal Sales Hub page because the rep portal
 * shows the same USPs and talking points. One copy means a wording change
 * reaches both audiences instead of drifting between them.
 */

/* ═══════════════════════════════════════════════════════════
   BRAND CONTENT — NI vs Sassy
   ═══════════════════════════════════════════════════════════ */

export type BrandContent = {
  name: string;
  oneLiner: string;
  elevator: string;
  pillars: { title: string; detail: string }[];
  targetConsumer: string;
  channels: Record<string, { usp: string; talkingPoints: string[] }>;
};

export const NI_BRAND: BrandContent = {
  name: "Natural Inspirations",
  oneLiner:
    "Spa-inspired personal care where clean fragrance meets spa-grade performance and ingredient integrity.",
  elevator:
    'Natural Inspirations combines gorgeous, clean fragrances with spa-grade formulations and a clear ingredient philosophy — "Indulge in the Good. Eliminate the Bad." Every product delivers a sensory self-care experience that feels luxurious, trustworthy, and aligned with modern values.',
  pillars: [
    {
      title: "Beautiful, Clean Fragrance",
      detail:
        "Fresh, comforting, and elevated — never heavy, synthetic, or overpowering.",
    },
    {
      title: "Spa-Grade Formulations",
      detail:
        "Rich textures, high-performance blends, and professional-quality results.",
    },
    {
      title: "Ingredient Integrity",
      detail:
        'Cold-pressed seed oils and the proprietary ExSeed® Antioxidant Complex. Guided by "Indulge in the Good. Eliminate the Bad."',
    },
  ],
  targetConsumer:
    "Women ages 35–65 who love clean, spa-inspired fragrances, want skincare that feels indulgent but not artificial, and value performance, comfort, and sensory experience.",
  channels: {
    GIFT: {
      usp: "Beautifully packaged, giftable self-care that smells incredible and feels luxurious.",
      talkingPoints: [
        "Strong gifting appeal — fragrance-forward, spa-quality products",
        "Clean ingredient story resonates with gift buyers",
        "Premium look and feel at accessible price points",
        "Great for seasonal sets, holidays, and everyday gifting",
      ],
    },
    "SALON/SPA": {
      usp: "Professional-grade formulations that match what spas already use — at retail-friendly margins.",
      talkingPoints: [
        "Spa-grade textures and performance clients already expect",
        "Clean ingredient story aligns with wellness positioning",
        "ExSeed® Antioxidant Complex is a unique differentiator",
        "Retail add-on opportunity after treatments",
      ],
    },
    PHARMACY: {
      usp: "Clean, trusted personal care with spa-quality results — positioned above mass, below clinical.",
      talkingPoints: [
        '"Indulge in the Good" philosophy resonates with health-conscious shoppers',
        "Clean ingredient list is easy for pharmacists to endorse",
        "Elevated packaging stands out on shelf",
        "Strong replenishment and repeat purchase patterns",
      ],
    },
    "NAT/GROCERY": {
      usp: "Clean-label personal care that delivers on fragrance and performance — not just ingredients.",
      talkingPoints: [
        "Meets clean beauty standards without compromising on experience",
        "Fragrance-forward approach differentiates from clinical competitors",
        'Appeals to the growing "premium self-care" aisle',
        "Strong crossover with natural food / wellness shoppers",
      ],
    },
    HOSPITAL: {
      usp: "Gentle, clean-ingredient personal care that feels comforting for patients and staff.",
      talkingPoints: [
        "Soothing fragrances designed for sensitive environments",
        "Clean ingredient philosophy aligns with healthcare values",
        "Spa-grade quality elevates patient experience",
        "Gift shop retail opportunity",
      ],
    },
    DISTRIBUTOR: {
      usp: "A proven, multi-channel brand with strong margins and a clear positioning story.",
      talkingPoints: [
        "Sells across gift, spa, pharmacy, and specialty channels",
        "Consistent brand story makes it easy to pitch to sub-accounts",
        "Clean + fragrance + spa is a unique tri-pillar positioning",
        "Marketing support and brand assets available",
      ],
    },
    HARDWARE: {
      usp: "Premium personal care gifting that stands out in non-traditional retail environments.",
      talkingPoints: [
        "Strong gifting appeal drives incremental basket size",
        "Attracts female shoppers into non-traditional aisles",
        "Clean, spa-quality story differentiates from commodity products",
      ],
    },
    WEB: {
      usp: "Direct-to-consumer clean beauty with gorgeous fragrance — optimized for discovery and subscription.",
      talkingPoints: [
        "Fragrance-first story performs well in digital marketing",
        "Clean ingredient list builds trust for online buyers",
        "High-AOV potential with sets and bundles",
        "Strong review and repeat purchase rates",
      ],
    },
    FLOWER: {
      usp: "The perfect complement to floral gifts — spa-quality self-care that smells as beautiful as the arrangement.",
      talkingPoints: [
        "Natural pairing with floral gifting occasions",
        "Fragrance-forward products align with the sensory experience",
        "Premium add-on that increases average order value",
      ],
    },
    CASINOS: {
      usp: "Upscale amenity-grade personal care that enhances the guest experience.",
      talkingPoints: [
        "Spa-grade quality expected in premium hospitality",
        "Clean ingredient story appeals to health-conscious guests",
        "Gift shop retail opportunity alongside amenity placement",
      ],
    },
    "SOCIAL SELLER": {
      usp: 'A clean beauty brand with a compelling story that practically sells itself in social settings.',
      talkingPoints: [
        'Strong fragrance-first hook — "smell this" is the easiest close',
        "Clean ingredient story builds trust and repeat orders",
        "Spa-quality positioning feels premium, not MLM",
      ],
    },
  },
};

export const SASSY_BRAND: BrandContent = {
  name: "Sassy by Natural Inspirations",
  oneLiner:
    "Bold, fun, and unapologetically fragrant personal care for the woman who wants to stand out.",
  elevator:
    "Sassy takes the clean, spa-grade foundation of Natural Inspirations and turns the volume up. Bolder fragrances, playful branding, and an attitude that says self-care should be fun — not fussy. Every product is designed to make you feel confident, energized, and a little bit extra.",
  pillars: [
    {
      title: "Bold Fragrance",
      detail:
        "Statement scents that are fun, flirty, and impossible to ignore — designed to turn heads.",
    },
    {
      title: "Playful & Confident",
      detail:
        "Vibrant packaging and branding that celebrates personality and self-expression.",
    },
    {
      title: "Clean Foundation",
      detail:
        "Built on the same spa-grade, clean ingredient philosophy as NI — but with more attitude.",
    },
  ],
  targetConsumer:
    "Women ages 20–45 who want personal care that matches their personality — bold, fun, and expressive. She shops for products that spark joy and make a statement.",
  channels: {
    GIFT: {
      usp: "Eye-catching, personality-driven gifts that stand out on the shelf and make an impression.",
      talkingPoints: [
        "Bold, fun packaging is instantly giftable",
        "Unique fragrance names create conversation",
        "Appeals to younger gift buyers looking for personality",
        "Impulse-buy friendly price points and sizing",
      ],
    },
    "SALON/SPA": {
      usp: "A fun, youthful retail add-on that brings energy to your spa boutique.",
      talkingPoints: [
        "Attracts a younger demographic to the retail area",
        "Playful branding complements the serious spa experience",
        "Clean ingredients clients can trust",
        "High margin, low commitment retail offering",
      ],
    },
    PHARMACY: {
      usp: "A vibrant, clean personal care line that energizes the beauty aisle.",
      talkingPoints: [
        "Bold packaging pops on shelf and drives discovery",
        "Clean ingredient story satisfies the health-conscious shopper",
        "Fun fragrance names create engagement",
        "Bridges the gap between mass and prestige",
      ],
    },
    "NAT/GROCERY": {
      usp: "Clean personal care with personality — not boring, not basic.",
      talkingPoints: [
        "Stands out in a sea of muted, clinical-looking products",
        "Clean ingredients meet natural grocery standards",
        "Fun branding appeals to younger natural shoppers",
        "Cross-merchandising potential with lifestyle products",
      ],
    },
    HOSPITAL: {
      usp: "A cheerful self-care gift option for hospital gift shops.",
      talkingPoints: [
        "Bright packaging lifts spirits — perfect for get-well gifts",
        "Clean, gentle formulations for sensitive situations",
        "Affordable price points for impulse gift purchases",
        "Complements NI for broader demographic coverage",
      ],
    },
    DISTRIBUTOR: {
      usp: "A complementary brand to NI that captures a younger, bolder demographic.",
      talkingPoints: [
        "Dual-brand strategy covers wider market",
        "Sassy opens doors NI might not — younger, trendier accounts",
        "Same quality foundation, different positioning",
        "Strong social media appeal drives pull-through",
      ],
    },
    HARDWARE: {
      usp: "A fun, affordable gifting option that appeals to a broader audience.",
      talkingPoints: [
        "Playful branding attracts impulse buyers",
        "Lower price points fit hardware store gift budgets",
        "Bold packaging creates a mini destination in-store",
      ],
    },
    WEB: {
      usp: "Social-media-ready personal care with personality built for virality.",
      talkingPoints: [
        "Instagram/TikTok-friendly branding and packaging",
        "Fun fragrance names drive curiosity clicks",
        "Strong review and share potential",
        "Subscription and bundle-friendly format",
      ],
    },
    FLOWER: {
      usp: "A fun, colorful add-on gift that complements floral arrangements with personality.",
      talkingPoints: [
        "Bright packaging pairs well with flower bouquets",
        "Affordable add-on that boosts order value",
        "Appeals to a younger gifting demographic",
      ],
    },
    CASINOS: {
      usp: "A vibrant, fun amenity option that adds personality to the guest experience.",
      talkingPoints: [
        "Bold branding fits the energy of casino environments",
        "Fun, memorable fragrances enhance the stay",
        "Retail opportunity in casino gift shops",
      ],
    },
    "SOCIAL SELLER": {
      usp: "The brand practically sells itself — bold, fun, and made for social.",
      talkingPoints: [
        "Packaging and names are instant conversation starters",
        "Social-media-ready products drive organic sharing",
        "Fun positioning makes selling feel effortless",
      ],
    },
  },
};

export const CHANNEL_ORDER = [
  "GIFT",
  "SALON/SPA",
  "PHARMACY",
  "NAT/GROCERY",
  "HOSPITAL",
  "DISTRIBUTOR",
  "HARDWARE",
  "WEB",
  "FLOWER",
  "CASINOS",
  "SOCIAL SELLER",
];
