/* ─── Block Types ─── */
export type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "columns"
  | "product"
  | "social"
  | "hero"
  | "caption"
  | "promotion"
  | "section";

export type TextAlign = "left" | "center" | "right";
export type FontFamily = "sans" | "serif" | "mono";
export type VAlign = "top" | "middle" | "bottom";

export interface BlockBase {
  id: string;
  type: BlockType;
  /**
   * Extra space above the block, in px. May be NEGATIVE to pull the block up
   * toward the one above it — e.g. a title tucked right under (or over) its
   * image. Undefined/0 = normal flow. Honoured in the editor canvas and by
   * modern email clients; Outlook's Word engine ignores negative margins and
   * simply renders the block at its normal position (a safe degrade).
   */
  marginTop?: number;
  /**
   * Extra space below the block, in px (may be negative). Currently surfaced in
   * the editor only for sections — a section's top/bottom margin is transparent
   * (shows the page/column behind it), so it spaces sections apart rather than
   * padding inside their background. Same modern-client / Outlook caveat as
   * {@link marginTop}.
   */
  marginBottom?: number;
}

export interface HeaderBlock extends BlockBase {
  type: "header";
  logoUrl: string;
  companyName: string;
  bgColor: string;
  textColor: string;
  /** Company-name text size when there's no logo (px). Defaults to 20. */
  fontSize?: number;
  /** Company-name font when there's no logo. Defaults to "sans". */
  fontFamily?: FontFamily;
  padding: number;
}

export interface TextBlock extends BlockBase {
  type: "text";
  html: string;
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
  textColor: string;
  bgColor: string;
  padding: number;
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  /** Preset keyword, or a custom percentage of the content column (1–100). */
  width: "full" | "half" | "third" | number;
  align: TextAlign;
  linkUrl: string;
  borderRadius: number;
  padding: number;
}

export interface ButtonBlock extends BlockBase {
  type: "button";
  text: string;
  url: string;
  bgColor: string;
  textColor: string;
  align: TextAlign;
  borderRadius: number;
  fontSize: number;
  padding: number;
}

export interface DividerBlock extends BlockBase {
  type: "divider";
  color: string;
  thickness: number;
  style: "solid" | "dashed" | "dotted";
  padding: number;
}

export interface SpacerBlock extends BlockBase {
  type: "spacer";
  height: number;
}

export interface ColumnsBlock extends BlockBase {
  type: "columns";
  columns: 2 | 3;
  gap: number;
  items: { heading: string; text: string; imageUrl: string }[];
  padding: number;
}

export interface ProductBlock extends BlockBase {
  type: "product";
  imageUrl: string;
  name: string;
  /** Product-name text size (px). Defaults to 16. */
  fontSize?: number;
  description: string;
  price: string;
  buttonText: string;
  buttonUrl: string;
  bgColor: string;
  padding: number;
}

export interface SocialBlock extends BlockBase {
  type: "social";
  align: TextAlign;
  facebook: string;
  instagram: string;
  tiktok: string;
  website: string;
  padding: number;
}

export interface HeroBlock extends BlockBase {
  type: "hero";
  imageUrl: string;
  heading: string;
  /** Heading text size (px). Defaults to 24. */
  fontSize?: number;
  subheading: string;
  buttonText: string;
  buttonUrl: string;
  overlay: boolean;
  textColor: string;
  padding: number;
}

/**
 * An image with a real (live-text) HEADLINE + subtext, either laid OVER the
 * image or as a caption panel above/below it. Unlike baking words into a JPG,
 * the text is HTML — so it stays sharp, is selectable, and (the point) survives
 * when the recipient's client blocks images: the `bgColor` fills the space and
 * the text reads on top of it. That makes it the image-blocked fail-safe the
 * plain image block can't be.
 */
export interface CaptionBlock extends BlockBase {
  type: "caption";
  imageUrl: string;
  alt: string;
  heading: string;
  subheading: string;
  /** overlay = text on the image; above/below = text as a caption panel. */
  layout: "overlay" | "above" | "below";
  textAlign: TextAlign;
  /** Overlay only: where the text sits vertically over the image. */
  verticalAlign: VAlign;
  textColor: string;
  /**
   * Solid colour behind the image. It is the fail-safe shown when the image is
   * blocked (overlay), and the panel colour for the above/below layouts.
   */
  bgColor: string;
  /** Overlay only: 0–80 dark scrim over the image so text stays legible. */
  scrim: number;
  /** Headline text size (px). */
  fontSize: number;
  /** Overlay band minimum height (px). */
  minHeight: number;
  padding: number;
}

export interface PromotionBlock extends BlockBase {
  type: "promotion";
  promotionId: string;
  headline: string;
  description: string;
  promoCode: string;
  discountLabel: string;
  expiresLabel: string;
  buttonText: string;
  buttonUrl: string;
  bgColor: string;
  accentColor: string;
  textColor: string;
  padding: number;
}

/**
 * A section is a styled container with 1–3 columns; each column holds a stack
 * of ordinary content blocks. This is what makes Klaviyo-style layouts possible
 * — e.g. an image in the left column with a heading, paragraph, and button
 * stacked in the right. Sections carry their own background (colour or hosted
 * image) and each column can too. Sections never nest inside sections (the
 * editor doesn't offer it), so the recursion here is one level deep in practice.
 */
export interface SectionColumn {
  id: string;
  blocks: EmailBlock[];
  /** Relative width weight across the row (e.g. 2 vs 3 for a 40/60 split). */
  weight: number;
  bgColor: string; // "" = transparent
  verticalAlign: VAlign;
  padding: number;
}

export interface SectionBlock extends BlockBase {
  type: "section";
  columns: SectionColumn[];
  bgColor: string; // "" = none
  bgImage: string; // hosted URL, "" = none
  padding: number;
  gap: number;
  stackOnMobile: boolean;
  verticalAlign: VAlign;
}

export type EmailBlock =
  | HeaderBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | ColumnsBlock
  | ProductBlock
  | SocialBlock
  | HeroBlock
  | CaptionBlock
  | PromotionBlock
  | SectionBlock;

/** Content blocks that may live inside a section column (everything but section). */
export const SECTION_CONTENT_TYPES: BlockType[] = [
  "image", "text", "button", "header", "divider", "spacer", "social", "product", "caption",
];

/* ─── Template Types ─── */
export type TemplateType = "email" | "sms" | "newsletter";
export type TemplateStatus = "draft" | "active" | "archived";
export type Brand = "ni" | "sassy" | "both";
export type Channel = "wholesale" | "d2c" | "both";

/**
 * Why a template exists — collected in the creation wizard and stored as a
 * slug. The allowed set lives here (not a DB check) so it can grow freely.
 */
export type TemplatePurpose =
  | "newsletter"
  | "winback"
  | "promotion"
  | "product_launch"
  | "welcome"
  | "announcement"
  | "other";

/**
 * Normalize a stored purpose value to an array. Tolerates the legacy `text`
 * column (a single slug string) and null, so the UI is safe whether or not the
 * text→text[] migration has been applied yet.
 */
export function toPurposeArray(p: unknown): TemplatePurpose[] {
  if (Array.isArray(p)) return p.filter((x): x is TemplatePurpose => typeof x === "string");
  if (typeof p === "string" && p.trim()) return [p as TemplatePurpose];
  return [];
}

export const TEMPLATE_PURPOSES: { value: TemplatePurpose; label: string; hint: string }[] = [
  { value: "newsletter", label: "Newsletter", hint: "Regular roundup — products, tips, behind the scenes" },
  { value: "winback", label: "Win-back / Recapture", hint: "Re-engage a lapsed or at-risk customer" },
  { value: "promotion", label: "Promotion / Sale", hint: "Discount, offer, or seasonal sale" },
  { value: "product_launch", label: "Product launch", hint: "Announce a new product or collection" },
  { value: "welcome", label: "Welcome / Onboarding", hint: "Greet a new customer or wholesale account" },
  { value: "announcement", label: "Announcement", hint: "News, updates, or a general announcement" },
  { value: "other", label: "Other", hint: "Anything else" },
];

/**
 * What drives a template's rendered output:
 *   "blocks" — the drag-and-drop builder (`blocks` → lib/email/renderBlocks).
 *   "html"   — an uploaded HTML file (`raw_html` → lib/email/rawHtml).
 *   "text"   — a plain-text body (`text_body` → lib/email/renderText).
 */
export type TemplateSource = "blocks" | "html" | "text";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string | null;
  type: TemplateType;
  brand: Brand | null;
  channel: Channel | null;
  status: TemplateStatus;
  source: TemplateSource;
  blocks: EmailBlock[];
  raw_html: string | null;
  /** Plain-text body for source='text' (with {{merge_fields}}). */
  text_body: string | null;
  sms_body: string | null;
  preview_text: string | null;
  from_name: string | null;
  reply_to: string | null;
  /** Bumped when loaded into the compose modal; drives "last used" ordering. */
  last_used_at: string | null;
  /** Profile id of the creator, for attribution. */
  created_by: string | null;
  /** Marketing intent(s), captured in the creation wizard (multi-select). */
  purpose: TemplatePurpose[] | null;
  /** Free-text note shown in the library. */
  description: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Default Blocks ─── */
export function newBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultBlock(type: BlockType): EmailBlock {
  const id = newBlockId();

  switch (type) {
    case "header":
      return { id, type, logoUrl: "", companyName: "Natural Inspirations", bgColor: "#1a5632", textColor: "#ffffff", padding: 20 };
    case "text":
      return { id, type, html: "<p>Enter your text here...</p>", fontSize: 15, fontFamily: "sans", textAlign: "left", textColor: "#374151", bgColor: "#ffffff", padding: 20 };
    case "image":
      return { id, type, src: "", alt: "Image", width: "full", align: "center", linkUrl: "", borderRadius: 0, padding: 10 };
    case "button":
      return { id, type, text: "Shop Now", url: "https://", bgColor: "#1a5632", textColor: "#ffffff", align: "center", borderRadius: 8, fontSize: 16, padding: 20 };
    case "divider":
      return { id, type, color: "#e5e7eb", thickness: 1, style: "solid", padding: 10 };
    case "spacer":
      return { id, type, height: 24 };
    case "columns":
      return { id, type, columns: 2, gap: 16, items: [{ heading: "Column 1", text: "Description", imageUrl: "" }, { heading: "Column 2", text: "Description", imageUrl: "" }], padding: 20 };
    case "product":
      return { id, type, imageUrl: "", name: "Product Name", description: "Product description here", price: "$24.00", buttonText: "Shop Now", buttonUrl: "https://", bgColor: "#ffffff", padding: 20 };
    case "social":
      return { id, type, align: "center", facebook: "", instagram: "", tiktok: "", website: "", padding: 20 };
    case "hero":
      return { id, type, imageUrl: "", heading: "Your Headline Here", subheading: "Supporting text goes here", buttonText: "Learn More", buttonUrl: "https://", overlay: true, textColor: "#ffffff", padding: 0 };
    case "caption":
      return { id, type, imageUrl: "", alt: "", heading: "Your Headline", subheading: "", layout: "overlay", textAlign: "center", verticalAlign: "middle", textColor: "#ffffff", bgColor: "#1a5632", scrim: 30, fontSize: 26, minHeight: 220, padding: 0 };
    case "promotion":
      return { id, type, promotionId: "", headline: "Special Offer", description: "Don't miss out on this limited-time deal.", promoCode: "", discountLabel: "", expiresLabel: "", buttonText: "Shop Now", buttonUrl: "https://", bgColor: "#f5f3ff", accentColor: "#7c3aed", textColor: "#1f2937", padding: 24 };
    case "section":
      return createSectionPreset("imageText");
  }
}

/* ─── Section presets ─── */
export type SectionPreset =
  | "imageText"
  | "textImage"
  | "twoCol"
  | "threeCol"
  | "band";

export const SECTION_PRESETS: { preset: SectionPreset; label: string }[] = [
  { preset: "imageText", label: "Image + Text" },
  { preset: "textImage", label: "Text + Image" },
  { preset: "twoCol", label: "Two Columns" },
  { preset: "threeCol", label: "Three Columns" },
  { preset: "band", label: "Full-width Band" },
];

function col(weight: number, blocks: EmailBlock[]): SectionColumn {
  return { id: newBlockId(), blocks, weight, bgColor: "", verticalAlign: "middle", padding: 12 };
}

/** A heading + paragraph + button stack — the typical "content" column. All
 *  center-aligned so it reads consistently next to an image. */
function contentStack(): EmailBlock[] {
  return [
    { ...(createDefaultBlock("header") as HeaderBlock), companyName: "Your Headline", logoUrl: "", bgColor: "", textColor: "#111827", padding: 0 },
    { ...(createDefaultBlock("text") as TextBlock), html: "<p>Supporting copy goes here. Keep it short and punchy.</p>", bgColor: "", padding: 0, textAlign: "center" },
    { ...(createDefaultBlock("button") as ButtonBlock), align: "center", padding: 0 },
  ];
}

export function createSectionPreset(preset: SectionPreset): SectionBlock {
  const base = { id: newBlockId(), type: "section" as const, bgColor: "", bgImage: "", padding: 24, gap: 20, stackOnMobile: true, verticalAlign: "middle" as VAlign };
  const image = () => [createDefaultBlock("image")];

  switch (preset) {
    case "imageText":
      return { ...base, columns: [col(1, image()), col(1, contentStack())] };
    case "textImage":
      return { ...base, columns: [col(1, contentStack()), col(1, image())] };
    case "twoCol":
      return { ...base, columns: [col(1, [createDefaultBlock("text")]), col(1, [createDefaultBlock("text")])] };
    case "threeCol":
      return { ...base, columns: [col(1, [createDefaultBlock("text")]), col(1, [createDefaultBlock("text")]), col(1, [createDefaultBlock("text")])] };
    case "band":
      return { ...base, bgColor: "#1a5632", columns: [col(1, [
        { ...(createDefaultBlock("header") as HeaderBlock), companyName: "Section Heading", logoUrl: "", bgColor: "", textColor: "#ffffff", padding: 0 },
        { ...(createDefaultBlock("text") as TextBlock), html: "<p style=\"text-align:center\">A full-width band — set a background colour or image.</p>", textColor: "#ffffff", bgColor: "", textAlign: "center", padding: 0 },
      ])] };
  }
}

/* ─── Brand Presets ─── */
export const BRAND_PRESETS = {
  ni: {
    name: "Natural Inspirations",
    primaryColor: "#1a5632",
    secondaryColor: "#d4a853",
    bgColor: "#f7f5f0",
    textColor: "#2d3b2d",
    fontFamily: "serif" as FontFamily,
    logoText: "Natural Inspirations",
    tagline: "Indulge in the Good. Eliminate the Bad.",
  },
  sassy: {
    name: "Sassy",
    primaryColor: "#d6336c",
    secondaryColor: "#f06595",
    bgColor: "#fff5f7",
    textColor: "#1a1a2e",
    fontFamily: "sans" as FontFamily,
    logoText: "Sassy",
    tagline: "Unapologetically You.",
  },
};
