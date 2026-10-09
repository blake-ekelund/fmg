import {
  AlignLeft,
  BadgePercent,
  Columns2,
  FileText,
  GalleryHorizontal,
  HelpCircle,
  LayoutGrid,
  LayoutList,
  Leaf,
  Link2,
  ListChecks,
  ListOrdered,
  Mail,
  Megaphone,
  MonitorPlay,
  Puzzle,
  MessageSquareQuote,
  MousePointerClick,
  Package,
  Palette,
  PanelTop,
  Rows3,
  Sparkles,
  SquareStack,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { EmbedKind, PageBlock, PageBlockType } from "@/lib/site/pageBlocks";

export const EMBED_LABEL: Record<EmbedKind, string> = {
  video: "Video",
  instagram: "Instagram post",
  map: "Map",
  form: "Google Form",
  countdown: "Countdown",
};

/** Palette / layer icon per block type. */
export const BLOCK_ICON: Record<PageBlockType, LucideIcon> = {
  hero: GalleryHorizontal,
  value_strip: Rows3,
  product_row: Package,
  shop_by_form: LayoutGrid,
  newsletter: Mail,
  promo_banner: Megaphone,
  image_text: Columns2,
  rich_text: AlignLeft,
  stats: BadgePercent,
  quote: MessageSquareQuote,
  link_list: ListOrdered,
  cta: MousePointerClick,
  callout: PanelTop,
  page_header: PanelTop,
  catalog: LayoutGrid,
  article_header: PanelTop,
  story_cover: GalleryHorizontal,
  contact_form: Mail,
  info_cards: SquareStack,
  policy: FileText,
  wholesale_intro: PanelTop,
  wholesale_catalog: Package,
  product_details: Package,
  benefits_banner: Sparkles,
  philosophy: Columns2,
  related_products: Package,
  reviews_note: Star,
  living_hero: GalleryHorizontal,
  collection_showcase: LayoutList,
  seed_band: Leaf,
  seed_cards: Leaf,
  statement: Megaphone,
  checklist: ListChecks,
  two_lists: Columns2,
  pillars: SquareStack,
  link_grid: Link2,
  link_cards: Link2,
  faq: HelpCircle,
  quiz: Sparkles,
  announcement: Megaphone,
  footer: Rows3,
  collections_copy: Leaf,
  widget: Puzzle,
  embed: MonitorPlay,
  theme: Palette,
};

/** One-line summary under each block in the list. */
export function summary(b: PageBlock): string {
  switch (b.type) {
    case "hero":
      return `${b.slides.length} slide${b.slides.length === 1 ? "" : "s"} · ${b.slides.map((s) => s.name).join(", ")}`;
    case "value_strip":
      return b.items.join(" · ") || "Empty";
    case "product_row":
      return `${b.heading || "No heading"} · ${b.source === "bestsellers" ? `top ${b.count} sellers` : `${b.parts.length} picked`}`;
    case "shop_by_form":
      return `${b.heading || "No heading"} · ${b.tiles.map((t) => t.label).join(", ")}`;
    case "promo_banner":
      return b.text || "Empty";
    case "image_text":
      return b.heading || "No heading";
    case "newsletter":
      return b.heading.replace(/\n/g, " ");
    case "rich_text":
    case "callout":
      return b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Empty";
    case "stats":
      return b.items.map((x) => `${x.value} ${x.label}`).join(" · ");
    case "quote":
      return [b.text, b.highlight].filter(Boolean).join(" ");
    case "link_list":
      return `${b.heading} · ${b.items.length} links`;
    case "cta":
    case "contact_form":
      return b.heading;
    case "page_header":
    case "policy":
    case "wholesale_intro":
      return [b.eyebrow, b.title].filter(Boolean).join(" · ");
    case "article_header":
      return `${b.title} ${b.titleAccent}`;
    case "info_cards":
      return b.cards.map((c) => c.label).join(" · ");
    case "wholesale_catalog":
      return `${b.heading} · ${b.count} products`;
    case "product_details":
      return `Trust line: ${b.trust.join(" · ")}`;
    case "benefits_banner":
      return `${b.heading} · ${b.items.length} lines`;
    case "philosophy":
      return b.columns.map((c) => c.heading).join(" / ");
    case "related_products":
    case "reviews_note":
      return b.heading;
    case "catalog":
    case "living_hero":
      return "Filled automatically";
    case "story_cover":
      return `${b.frames.length} photos`;
    case "collection_showcase":
      return `${b.heading} · panels fill automatically`;
    case "seed_band":
    case "seed_cards":
      return `${b.heading.replace(/\n/g, " ")} · ${b.items.map((x) => x.name).join(", ")}`;
    case "statement":
      return b.heading.replace(/\n/g, " ");
    case "checklist":
      return `${b.heading} · ${b.items.length} points`;
    case "two_lists":
      return [b.leftTitle, b.rightTitle].filter(Boolean).join(" / ");
    case "pillars":
      return b.items.map((x) => x.title).join(" · ");
    case "link_grid":
      return `${b.heading} · ${b.items.length} links`;
    case "link_cards":
      return b.cards.map((c) => c.title).join(" · ");
    case "faq":
      return `${b.heading || "Questions"} · ${b.items.length}`;
    case "quiz":
      return `${b.questions.length} questions · ${b.personas.map((p) => p.name).join(", ")}`;
    case "announcement":
      return b.retail.join(" · ");
    case "footer":
      return b.columns.map((c) => c.heading).join(" · ");
    case "collections_copy":
      return `${b.items.length} collections`;
    case "widget":
      return "Saved widget";
    case "theme":
      return `${Object.keys(b.palette).length || "No"} color${Object.keys(b.palette).length === 1 ? "" : "s"} changed`;
    case "embed":
      return `${EMBED_LABEL[b.kind]}${b.heading ? ` · ${b.heading}` : ""}`;
  }
}
