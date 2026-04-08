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
  | "promotion";

export type TextAlign = "left" | "center" | "right";
export type FontFamily = "sans" | "serif" | "mono";

export interface BlockBase {
  id: string;
  type: BlockType;
}

export interface HeaderBlock extends BlockBase {
  type: "header";
  logoUrl: string;
  companyName: string;
  bgColor: string;
  textColor: string;
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
  width: "full" | "half" | "third";
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
  subheading: string;
  buttonText: string;
  buttonUrl: string;
  overlay: boolean;
  textColor: string;
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
  | PromotionBlock;

/* ─── Template Types ─── */
export type TemplateType = "email" | "sms" | "newsletter";
export type TemplateStatus = "draft" | "active" | "archived";
export type Brand = "ni" | "sassy" | "both";
export type Channel = "wholesale" | "d2c" | "both";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string | null;
  type: TemplateType;
  brand: Brand | null;
  channel: Channel | null;
  status: TemplateStatus;
  blocks: EmailBlock[];
  sms_body: string | null;
  preview_text: string | null;
  from_name: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Default Blocks ─── */
export function createDefaultBlock(type: BlockType): EmailBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
    case "promotion":
      return { id, type, promotionId: "", headline: "Special Offer", description: "Don't miss out on this limited-time deal.", promoCode: "", discountLabel: "", expiresLabel: "", buttonText: "Shop Now", buttonUrl: "https://", bgColor: "#f5f3ff", accentColor: "#7c3aed", textColor: "#1f2937", padding: 24 };
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
