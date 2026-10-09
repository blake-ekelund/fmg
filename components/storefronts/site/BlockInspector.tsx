"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  LIMITS,
  QUIZ_PERSONAS,
  type FormTile,
  type HeroSlide,
  type CollectionCopy,
  type CollectionsCopyBlock,
  type FooterLink,
  type PageBlock,
  type QuizBlock,
  type QuizOption,
  type QuizPersonaCopy,
  type QuizQuestion,
  type SeedItem,
  type Tone,
} from "@/lib/site/pageBlocks";
import RichTextEditor from "@/components/marketing/blog/RichTextEditor";
import {
  ColorInput,
  Field,
  IconButton,
  ImageInput,
  ItemCard,
  Segmented,
  Select,
  StringList,
  TextArea,
  TextInput,
  move,
} from "./fields";

export type CatalogItem = { part: string; name: string };

const TONES: { value: Tone; label: string }[] = [
  { value: "blush", label: "Blush" },
  { value: "pink", label: "Hot pink" },
  { value: "ink", label: "Dark" },
];

const LINK_HINT = "A site path like /shop or /story, or a full https:// link.";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The form for one block. Every field is content — the look of each block is
 * fixed by the storefront, so there are no font/size/spacing controls here.
 */
export default function BlockInspector({
  block,
  onChange,
  catalog,
  slug,
  brand,
  onOpenPage,
}: {
  block: PageBlock;
  onChange: (b: PageBlock) => void;
  catalog: CatalogItem[];
  /** Jump to another page of the same store in the editor. */
  onOpenPage?: (slug: string) => void;
  /** The page being edited (a few fields only apply to one page). */
  slug: string;
  /** The store — a few fields only exist on one store's design. */
  brand: "Sassy" | "NI";
}) {
  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-4">
          {onOpenPage ? (
            <OpenPage label="Edit the quiz — questions, scoring & results" onClick={() => onOpenPage("quiz")} />
          ) : null}
          <HeroForm slides={block.slides} onChange={(slides) => onChange({ ...block, slides })} catalog={catalog} />
        </div>
      );

    case "value_strip":
      return (
        <Field label="Lines" hint="Short brand promises, shown in one row under the hero on desktop.">
          <StringList
            items={block.items}
            max={LIMITS.valueItems}
            placeholder="Vegan & cruelty-free"
            onChange={(items) => onChange({ ...block, items })}
          />
        </Field>
      );

    case "product_row":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <LinkFields
            label={block.linkLabel}
            href={block.linkHref}
            onChange={(linkLabel, linkHref) => onChange({ ...block, linkLabel, linkHref })}
            title="Side link"
          />
          <Field label="Which products">
            <Segmented
              value={block.source}
              onChange={(source) => onChange({ ...block, source })}
              options={[
                { value: "bestsellers", label: "Bestsellers (automatic)" },
                { value: "pick", label: "Pick them" },
              ]}
            />
          </Field>
          {block.source === "bestsellers" ? (
            <Field
              label="How many"
              hint="Top sellers by $ sold over the last 6 months, topped up automatically if there aren't enough."
            >
              <Select
                value={String(block.count)}
                onChange={(v) => onChange({ ...block, count: Number(v) })}
                options={[4, 8].map((n) => ({ value: String(n), label: `${n} products` }))}
              />
            </Field>
          ) : (
            <PartPicker
              parts={block.parts}
              catalog={catalog}
              onChange={(parts) => onChange({ ...block, parts })}
            />
          )}
        </div>
      );

    case "shop_by_form":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <LinkFields
            label={block.linkLabel}
            href={block.linkHref}
            onChange={(linkLabel, linkHref) => onChange({ ...block, linkLabel, linkHref })}
            title="Side link"
          />
          <TilesForm tiles={block.tiles} onChange={(tiles) => onChange({ ...block, tiles })} />
        </div>
      );

    case "promo_banner":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={40} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Message">
            <TextArea value={block.text} rows={2} maxLength={160} onChange={(text) => onChange({ ...block, text })} />
          </Field>
          <LinkFields
            label={block.ctaLabel}
            href={block.ctaHref}
            onChange={(ctaLabel, ctaHref) => onChange({ ...block, ctaLabel, ctaHref })}
            title="Button"
          />
          <Field label="Color">
            <Segmented value={block.tone} onChange={(tone) => onChange({ ...block, tone })} options={TONES} />
          </Field>
        </div>
      );

    case "image_text":
      return (
        <div className="space-y-4">
          <Field label="Photo">
            <ImageInput value={block.image} onChange={(image) => onChange({ ...block, image })} optional="Text only without one." />
          </Field>
          {block.image ? (
            <>
              <Field label="Photo description" hint="Read aloud by screen readers.">
                <TextInput value={block.imageAlt} maxLength={200} onChange={(imageAlt) => onChange({ ...block, imageAlt })} />
              </Field>
              <Field label="Photo side">
                <Segmented
                  value={block.imageSide}
                  onChange={(imageSide) => onChange({ ...block, imageSide })}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "right", label: "Right" },
                  ]}
                />
              </Field>
            </>
          ) : null}
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={40} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Text">
            <TextArea value={block.body} rows={5} maxLength={1200} onChange={(body) => onChange({ ...block, body })} />
          </Field>
          <LinkFields
            label={block.ctaLabel}
            href={block.ctaHref}
            onChange={(ctaLabel, ctaHref) => onChange({ ...block, ctaLabel, ctaHref })}
            title="Button"
          />
          <Field label="Color">
            <Segmented value={block.tone} onChange={(tone) => onChange({ ...block, tone })} options={TONES} />
          </Field>
        </div>
      );

    case "newsletter":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={40} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading" hint="Press Enter for a line break.">
            <TextArea value={block.heading} rows={2} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Text">
            <TextArea value={block.body} rows={3} maxLength={400} onChange={(body) => onChange({ ...block, body })} />
          </Field>
          <Field label="Fine print">
            <TextInput value={block.footnote} maxLength={120} onChange={(footnote) => onChange({ ...block, footnote })} />
          </Field>
          {brand === "Sassy" ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              The signup gives the WELCOME15 code — the offer itself is set in Discounts, not here.
            </p>
          ) : null}
        </div>
      );

    case "rich_text":
      return <RichField value={block.html} onChange={(html) => onChange({ ...block, html })} />;

    case "stats":
      return (
        <ObjList
          label="Numbers"
          items={block.items}
          max={LIMITS.stats}
          onChange={(items) => onChange({ ...block, items })}
          make={(id) => ({ id, value: "1", label: "Label" })}
          title={(x) => `${x.value} — ${x.label}`}
          render={(x, set) => (
            <>
              <Field label="Number">
                <TextInput value={x.value} maxLength={20} onChange={(value) => set({ value })} />
              </Field>
              <Field label="Label">
                <TextInput value={x.label} maxLength={80} onChange={(label) => set({ label })} />
              </Field>
            </>
          )}
        />
      );

    case "quote":
      return (
        <div className="space-y-4">
          <Field label="Small label (optional)">
            <TextInput value={block.eyebrow} maxLength={40} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Quote">
            <TextArea value={block.text} rows={3} maxLength={400} onChange={(text) => onChange({ ...block, text })} />
          </Field>
          <Field label="Accent ending (optional)" hint="Added after the quote in pink.">
            <TextInput value={block.highlight} maxLength={200} onChange={(highlight) => onChange({ ...block, highlight })} />
          </Field>
          <Field label="Small line under it (optional)">
            <TextInput value={block.footnote} maxLength={120} onChange={(footnote) => onChange({ ...block, footnote })} />
          </Field>
        </div>
      );

    case "link_list":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Small line under it">
            <TextInput value={block.subheading} maxLength={80} onChange={(subheading) => onChange({ ...block, subheading })} />
          </Field>
          <ObjList
            label="Links"
            items={block.items}
            max={LIMITS.links}
            onChange={(items) => onChange({ ...block, items })}
            make={(id) => ({ id, label: "New link", note: "", href: "/shop" })}
            title={(x) => x.label}
            subtitle={(x) => x.note}
            render={(x, set) => (
              <>
                <Field label="Name">
                  <TextInput value={x.label} maxLength={60} onChange={(label) => set({ label })} />
                </Field>
                <Field label="Note on the right">
                  <TextInput value={x.note} maxLength={80} onChange={(note) => set({ note })} />
                </Field>
                <Field label="Link" hint={LINK_HINT}>
                  <TextInput value={x.href} onChange={(href) => set({ href })} />
                </Field>
              </>
            )}
          />
        </div>
      );

    case "cta":
      return (
        <div className="space-y-4">
          <Field label="Line">
            <TextInput value={block.heading} maxLength={120} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <LinkFields
            title="Main button"
            label={block.primaryLabel}
            href={block.primaryHref}
            onChange={(primaryLabel, primaryHref) => onChange({ ...block, primaryLabel, primaryHref })}
          />
          <LinkFields
            title="Second button"
            label={block.secondaryLabel}
            href={block.secondaryHref}
            onChange={(secondaryLabel, secondaryHref) => onChange({ ...block, secondaryLabel, secondaryHref })}
          />
        </div>
      );

    case "callout":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={40} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <RichField value={block.html} onChange={(html) => onChange({ ...block, html })} />
        </div>
      );

    case "page_header":
      return (
        <div className="space-y-4">
          <HeaderFields
            eyebrow={block.eyebrow}
            title={block.title}
            lede={block.lede}
            onChange={(p) => onChange({ ...block, ...p })}
          />
          {slug === "shop" ? (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium text-gray-700">Signed-in wholesale buyers see instead</p>
              <HeaderFields
                eyebrow={block.wholesaleEyebrow}
                title={block.wholesaleTitle}
                lede={block.wholesaleLede}
                onChange={(p) =>
                  onChange({
                    ...block,
                    ...(p.eyebrow !== undefined ? { wholesaleEyebrow: p.eyebrow } : {}),
                    ...(p.title !== undefined ? { wholesaleTitle: p.title } : {}),
                    ...(p.lede !== undefined ? { wholesaleLede: p.lede } : {}),
                  })
                }
              />
            </div>
          ) : null}
        </div>
      );

    case "story_cover":
      return (
        <ObjList
          label="Photos (they rotate; each links to a story)"
          items={block.frames}
          max={LIMITS.frames}
          onChange={(frames) => onChange({ ...block, frames })}
          make={(id) => ({ id, name: "New photo", image: "", href: "/blog" })}
          title={(x) => x.name}
          subtitle={(x) => x.href}
          render={(x, set) => (
            <>
              <Field label="Name (shown on the photo)">
                <TextInput value={x.name} maxLength={60} onChange={(name) => set({ name })} />
              </Field>
              <Field label="Photo" hint="Wide, about 1920 × 1067.">
                <ImageInput value={x.image} onChange={(image) => set({ image })} />
              </Field>
              <Field label="Links to" hint={LINK_HINT}>
                <TextInput value={x.href} onChange={(href) => set({ href })} />
              </Field>
            </>
          )}
        />
      );

    case "catalog":
      return (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Nothing to edit here — this part fills itself
          {CATALOG_SOURCE[slug] ?? " from the products in Products."}{" "}
          Move the blocks around it to change what comes before and after.
        </p>
      );

    case "article_header":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.kicker} maxLength={60} onChange={(kicker) => onChange({ ...block, kicker })} />
          </Field>
          <Field label="Headline">
            <TextInput value={block.title} maxLength={100} onChange={(title) => onChange({ ...block, title })} />
          </Field>
          <Field label="Headline, pink part">
            <TextInput value={block.titleAccent} maxLength={100} onChange={(titleAccent) => onChange({ ...block, titleAccent })} />
          </Field>
          <Field label="Tags">
            <StringList items={block.tags} max={LIMITS.tags} placeholder="Playful" onChange={(tags) => onChange({ ...block, tags })} />
          </Field>
        </div>
      );

    case "contact_form":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Line under it">
            <TextInput value={block.subheading} maxLength={200} onChange={(subheading) => onChange({ ...block, subheading })} />
          </Field>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            The form fields themselves are fixed; messages arrive in Storefronts → Conversations.
          </p>
        </div>
      );

    case "info_cards":
      return (
        <div className="space-y-3">
          {block.cards.map((c, i) => {
            const set = (patch: Partial<typeof c>) =>
              onChange({ ...block, cards: block.cards.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={c.id} className="space-y-3 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-700">
                  {c.tone === "ink" ? "Dark card" : c.tone === "plain" ? "White card" : "Tinted card"}
                </p>
                <Field label="Small label">
                  <TextInput value={c.label} maxLength={40} onChange={(label) => set({ label })} />
                </Field>
                <Field label="Title">
                  <TextInput value={c.title} maxLength={80} onChange={(title) => set({ title })} />
                </Field>
                <Field label="Text">
                  <TextArea value={c.body} rows={2} maxLength={400} onChange={(body) => set({ body })} />
                </Field>
                <Field label="Email (optional)">
                  <TextInput value={c.email} maxLength={120} onChange={(email) => set({ email })} />
                </Field>
                {brand === "NI" ? (
                  <>
                    <Field label="Phone (optional)">
                      <TextInput value={c.phone} maxLength={30} onChange={(phone) => set({ phone })} />
                    </Field>
                    <Field label="Small rows (optional)" hint="One per line: left | right — e.g. Consumer (CST) | Mon–Fri, 8:00–4:30">
                      <TextArea value={c.details} rows={2} maxLength={400} onChange={(details) => set({ details })} />
                    </Field>
                    <LinkFields
                      title="Link"
                      label={c.linkLabel}
                      href={c.linkHref}
                      onChange={(linkLabel, linkHref) => set({ linkLabel, linkHref })}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      );

    case "policy":
      return (
        <div className="space-y-4">
          <HeaderFields eyebrow={block.eyebrow} title={block.title} lede={block.lede} onChange={(p) => onChange({ ...block, ...p })} />
          {brand === "NI" ? (
            <Field label="Last updated" hint="Shown under the title.">
              <TextInput value={block.highlightTitle} maxLength={80} onChange={(highlightTitle) => onChange({ ...block, highlightTitle })} />
            </Field>
          ) : (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">Side card</p>
            <Field label="Small label" hint="e.g. last updated, the short version">
              <TextInput value={block.highlightLabel} maxLength={40} onChange={(highlightLabel) => onChange({ ...block, highlightLabel })} />
            </Field>
            <Field label="Title">
              <TextInput value={block.highlightTitle} maxLength={80} onChange={(highlightTitle) => onChange({ ...block, highlightTitle })} />
            </Field>
            <Field label="Text">
              <TextArea value={block.highlightBody} rows={2} maxLength={400} onChange={(highlightBody) => onChange({ ...block, highlightBody })} />
            </Field>
          </div>
          )}
          {brand === "Sassy" ? (
            <Field label="“Get in touch” lead-in">
              <TextInput value={block.help} maxLength={160} onChange={(help) => onChange({ ...block, help })} />
            </Field>
          ) : null}
          <Field label="Policy text">
            <RichField value={block.html} onChange={(html) => onChange({ ...block, html })} />
          </Field>
        </div>
      );

    case "wholesale_intro":
      return (
        <div className="space-y-4">
          <HeaderFields eyebrow={block.eyebrow} title={block.title} lede={block.lede} onChange={(p) => onChange({ ...block, ...p })} />
          <Field label="Stat tiles">
            <div className="space-y-2">
              {block.stats.map((x, i) => (
                <div key={x.id} className="grid grid-cols-2 gap-2">
                  <TextInput
                    value={x.label}
                    maxLength={40}
                    onChange={(label) => onChange({ ...block, stats: block.stats.map((s, j) => (j === i ? { ...s, label } : s)) })}
                  />
                  <TextInput
                    value={x.value}
                    maxLength={20}
                    onChange={(value) => onChange({ ...block, stats: block.stats.map((s, j) => (j === i ? { ...s, value } : s)) })}
                  />
                </div>
              ))}
            </div>
          </Field>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            The buttons (first order, line sheet, dashboard) and the “you’re in” notice are fixed.
          </p>
        </div>
      );

    case "wholesale_catalog":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Link text">
            <TextInput value={block.linkLabel} maxLength={40} onChange={(linkLabel) => onChange({ ...block, linkLabel })} />
          </Field>
          <Field label="How many" hint="Cheapest case price first.">
            <Select
              value={String(block.count)}
              onChange={(v) => onChange({ ...block, count: Number(v) })}
              options={[4, 8].map((n) => ({ value: String(n), label: `${n} products` }))}
            />
          </Field>
        </div>
      );

    case "product_details":
      return (
        <div className="space-y-4">
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            Photos, name, price, description, benefits, ingredients, how to use and the buy button come from each
            product in <strong>Products</strong> — edit them there. Page colors are set per product there too.
          </p>
          <Field label="Trust line" hint="The short claims above the details, separated by dots.">
            <StringList items={block.trust} max={LIMITS.trust} placeholder="vegan + cruelty-free" onChange={(trust) => onChange({ ...block, trust })} />
          </Field>
        </div>
      );

    case "benefits_banner":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Only on products whose form contains" hint="Comma-separated words, e.g. hand cr. Blank = every product.">
            <TextInput value={block.formMatch} maxLength={120} onChange={(formMatch) => onChange({ ...block, formMatch })} />
          </Field>
          <ObjList
            label="Lines"
            items={block.items}
            max={LIMITS.benefits}
            onChange={(items) => onChange({ ...block, items })}
            make={(id) => ({ id, lead: "Something true,", punch: "said with attitude." })}
            title={(x) => `${x.lead} ${x.punch}`}
            render={(x, set) => (
              <>
                <Field label="Start">
                  <TextInput value={x.lead} maxLength={80} onChange={(lead) => set({ lead })} />
                </Field>
                <Field label="Punch line (italic)">
                  <TextInput value={x.punch} maxLength={80} onChange={(punch) => set({ punch })} />
                </Field>
              </>
            )}
          />
        </div>
      );

    case "philosophy":
      return (
        <ObjList
          label="Columns"
          items={block.columns}
          max={LIMITS.columns}
          onChange={(columns) => onChange({ ...block, columns })}
          make={(id) => ({ id, eyebrow: "", heading: "A heading", intro: "", subheading: "", body: "", pullQuote: "" })}
          title={(x) => x.heading}
          subtitle={(x) => x.eyebrow}
          render={(x, set) => (
            <>
              <Field label="Small label">
                <TextInput value={x.eyebrow} maxLength={60} onChange={(eyebrow) => set({ eyebrow })} />
              </Field>
              <Field label="Heading">
                <TextInput value={x.heading} maxLength={120} onChange={(heading) => set({ heading })} />
              </Field>
              <Field label="Intro">
                <TextArea value={x.intro} rows={3} maxLength={600} onChange={(intro) => set({ intro })} />
              </Field>
              <Field label="Subheading (optional)">
                <TextInput value={x.subheading} maxLength={100} onChange={(subheading) => set({ subheading })} />
              </Field>
              <Field label="Text (optional)">
                <RichField value={x.body} onChange={(body) => set({ body })} />
              </Field>
              <Field label="Pull quote (optional)">
                <TextArea value={x.pullQuote} rows={2} maxLength={240} onChange={(pullQuote) => set({ pullQuote })} />
              </Field>
            </>
          )}
        />
      );

    case "related_products":
      return (
        <div className="space-y-4">
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={80} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Heading for wholesale buyers">
            <TextInput value={block.wholesaleHeading} maxLength={80} onChange={(wholesaleHeading) => onChange({ ...block, wholesaleHeading })} />
          </Field>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            The four products are picked automatically for each product page.
          </p>
        </div>
      );

    case "reviews_note":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Message">
            <TextArea value={block.message} rows={3} maxLength={400} onChange={(message) => onChange({ ...block, message })} />
          </Field>
        </div>
      );

    case "living_hero":
      return onOpenPage ? (
        <div className="space-y-3">
          <OpenPage label="Edit each collection's hero words" onClick={() => onOpenPage("collection-copy")} />
          <p className="text-[11px] text-gray-500">Photos, colors and the moving art stay with each collection.</p>
        </div>
      ) : (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Nothing to edit here — the hero shows one slide per fragrance collection, using each collection&apos;s own
          photo and colors.
        </p>
      );

    case "collection_showcase":
      return (
        <div className="space-y-4">
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            One panel per fragrance collection with its two bestsellers — filled automatically. The words around them
            are set here.
          </p>
          {onOpenPage ? (
            <OpenPage label="Edit each collection's tagline & story" onClick={() => onOpenPage("collection-copy")} />
          ) : null}
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Intro">
            <TextArea value={block.lede} rows={2} maxLength={500} onChange={(lede) => onChange({ ...block, lede })} />
          </Field>
          <Field label="Link text (to all collections)">
            <TextInput value={block.linkLabel} maxLength={40} onChange={(linkLabel) => onChange({ ...block, linkLabel })} />
          </Field>
          <Field label="Reassurance line" hint="Short promises under the panels. Links: [text](/page).">
            <StringList items={block.comfort} max={4} placeholder="Free shipping over $75" onChange={(comfort) => onChange({ ...block, comfort })} />
          </Field>
        </div>
      );

    case "seed_band":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading" hint="Enter makes a new line.">
            <TextArea value={block.heading} rows={2} maxLength={120} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Text">
            <RichField value={block.html} onChange={(html) => onChange({ ...block, html })} />
          </Field>
          <SeedItems items={block.items} onChange={(items) => onChange({ ...block, items })} />
          <LinkFields
            title="Link"
            label={block.ctaLabel}
            href={block.ctaHref}
            onChange={(ctaLabel, ctaHref) => onChange({ ...block, ctaLabel, ctaHref })}
          />
        </div>
      );

    case "seed_cards":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <ObjList
            label="Seeds"
            items={block.items}
            max={LIMITS.seeds}
            onChange={(items) => onChange({ ...block, items })}
            make={(id) => ({ id, name: "Black Cumin", origin: "", body: "" })}
            title={(x) => x.name}
            subtitle={(x) => x.origin}
            render={(x, set) => (
              <>
                <Field label="Seed" hint={SEED_HINT}>
                  <TextInput value={x.name} maxLength={40} onChange={(name) => set({ name })} />
                </Field>
                <Field label="Where it comes from">
                  <TextInput value={x.origin} maxLength={200} onChange={(origin) => set({ origin })} />
                </Field>
                <Field label="What it does">
                  <TextArea value={x.body} rows={3} maxLength={600} onChange={(body) => set({ body })} />
                </Field>
              </>
            )}
          />
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">Closing card</p>
            <Field label="Heading">
              <TextInput value={block.closingHeading} maxLength={100} onChange={(closingHeading) => onChange({ ...block, closingHeading })} />
            </Field>
            <Field label="Text">
              <TextArea value={block.closingBody} rows={2} maxLength={400} onChange={(closingBody) => onChange({ ...block, closingBody })} />
            </Field>
            <LinkFields
              title="Button"
              label={block.ctaLabel}
              href={block.ctaHref}
              onChange={(ctaLabel, ctaHref) => onChange({ ...block, ctaLabel, ctaHref })}
            />
          </div>
        </div>
      );

    case "statement":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Big line">
            <TextArea value={block.heading} rows={2} maxLength={160} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Text">
            <TextArea value={block.body} rows={3} maxLength={600} onChange={(body) => onChange({ ...block, body })} />
          </Field>
        </div>
      );

    case "checklist":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <Field label="Intro">
            <TextArea value={block.intro} rows={3} maxLength={600} onChange={(intro) => onChange({ ...block, intro })} />
          </Field>
          <Field label="Points">
            <StringList items={block.items} max={LIMITS.checklist} onChange={(items) => onChange({ ...block, items })} />
          </Field>
          <Field label="Marker">
            <Segmented
              value={block.marker}
              onChange={(marker) => onChange({ ...block, marker })}
              options={[
                { value: "check", label: "✓ Check" },
                { value: "leaf", label: "Leaf" },
              ]}
            />
          </Field>
        </div>
      );

    case "two_lists":
      return (
        <div className="space-y-4">
          <Field label="Small label (optional)">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading (optional)" hint="Enter makes a new line.">
            <TextArea value={block.heading} rows={2} maxLength={120} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <Field label="Left list title">
              <TextInput value={block.leftTitle} maxLength={60} onChange={(leftTitle) => onChange({ ...block, leftTitle })} />
            </Field>
            <StringList items={block.leftItems} max={LIMITS.listItems} onChange={(leftItems) => onChange({ ...block, leftItems })} />
          </div>
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <Field label="Right list title">
              <TextInput value={block.rightTitle} maxLength={60} onChange={(rightTitle) => onChange({ ...block, rightTitle })} />
            </Field>
            <StringList items={block.rightItems} max={LIMITS.listItems} onChange={(rightItems) => onChange({ ...block, rightItems })} />
          </div>
        </div>
      );

    case "pillars":
      return (
        <ObjList
          label="Cards"
          items={block.items}
          max={LIMITS.pillars}
          onChange={(items) => onChange({ ...block, items })}
          make={(id) => ({ id, title: "A title", body: "" })}
          title={(x) => x.title}
          render={(x, set) => (
            <>
              <Field label="Title">
                <TextInput value={x.title} maxLength={80} onChange={(title) => set({ title })} />
              </Field>
              <Field label="Text">
                <TextArea value={x.body} rows={4} maxLength={600} onChange={(body) => set({ body })} />
              </Field>
            </>
          )}
        />
      );

    case "link_grid":
      return (
        <div className="space-y-4">
          <Field label="Small label">
            <TextInput value={block.eyebrow} maxLength={60} onChange={(eyebrow) => onChange({ ...block, eyebrow })} />
          </Field>
          <Field label="Heading">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <ObjList
            label="Links"
            items={block.items}
            max={LIMITS.linkGrid}
            onChange={(items) => onChange({ ...block, items })}
            make={(id) => ({ id, label: "New link", href: "/ingredients" })}
            title={(x) => x.label}
            subtitle={(x) => x.href}
            render={(x, set) => (
              <>
                <Field label="Text">
                  <TextInput value={x.label} maxLength={60} onChange={(label) => set({ label })} />
                </Field>
                <Field label="Link" hint={LINK_HINT}>
                  <TextInput value={x.href} onChange={(href) => set({ href })} />
                </Field>
              </>
            )}
          />
        </div>
      );

    case "link_cards":
      return (
        <ObjList
          label="Cards"
          items={block.cards}
          max={LIMITS.linkCards}
          onChange={(cards) => onChange({ ...block, cards })}
          make={(id) => ({ id, eyebrow: "", title: "A title →", body: "", href: "/shop" })}
          title={(x) => x.title}
          subtitle={(x) => x.href}
          render={(x, set) => (
            <>
              <Field label="Small label">
                <TextInput value={x.eyebrow} maxLength={60} onChange={(eyebrow) => set({ eyebrow })} />
              </Field>
              <Field label="Title">
                <TextInput value={x.title} maxLength={100} onChange={(title) => set({ title })} />
              </Field>
              <Field label="Text">
                <TextArea value={x.body} rows={2} maxLength={300} onChange={(body) => set({ body })} />
              </Field>
              <Field label="Link" hint={LINK_HINT}>
                <TextInput value={x.href} onChange={(href) => set({ href })} />
              </Field>
            </>
          )}
        />
      );

    case "quiz":
      return <QuizForm block={block} onChange={onChange} catalog={catalog} />;

    case "announcement":
      return (
        <div className="space-y-4">
          <Field label="Messages" hint="They rotate every few seconds. Links: [text](/page).">
            <StringList items={block.retail} max={LIMITS.announcements} onChange={(retail) => onChange({ ...block, retail })} />
          </Field>
          <Field label="Messages for signed-in wholesale buyers">
            <StringList
              items={block.wholesale}
              max={LIMITS.announcements}
              onChange={(wholesale) => onChange({ ...block, wholesale })}
            />
          </Field>
        </div>
      );

    case "footer":
      return (
        <div className="space-y-4">
          <Field label="Tagline">
            <TextArea value={block.tagline} rows={2} maxLength={300} onChange={(tagline) => onChange({ ...block, tagline })} />
          </Field>
          {brand === "NI" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Signup label">
                <TextInput value={block.subscribeEyebrow} maxLength={40} onChange={(subscribeEyebrow) => onChange({ ...block, subscribeEyebrow })} />
              </Field>
              <Field label="Signup line">
                <TextInput value={block.subscribeText} maxLength={160} onChange={(subscribeText) => onChange({ ...block, subscribeText })} />
              </Field>
            </div>
          ) : null}
          <ObjList
            label="Link columns"
            items={block.columns}
            max={LIMITS.footerColumns}
            onChange={(columns) => onChange({ ...block, columns })}
            make={(id) => ({ id, heading: "New column", links: [] })}
            title={(x) => x.heading}
            subtitle={(x) => x.links.map((l) => l.label).join(", ")}
            render={(x, set) => (
              <>
                <Field label="Heading">
                  <TextInput value={x.heading} maxLength={40} onChange={(heading) => set({ heading })} />
                </Field>
                <Field label="Links" hint={LINK_HINT}>
                  <LinkRows links={x.links} onChange={(links) => set({ links })} />
                </Field>
              </>
            )}
          />
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">Sister brand link</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Small label">
                <TextInput value={block.sisterEyebrow} maxLength={60} onChange={(sisterEyebrow) => onChange({ ...block, sisterEyebrow })} />
              </Field>
              <Field label="Name">
                <TextInput value={block.sisterName} maxLength={60} onChange={(sisterName) => onChange({ ...block, sisterName })} />
              </Field>
            </div>
            <Field label="Link">
              <TextInput value={block.sisterHref} onChange={(sisterHref) => onChange({ ...block, sisterHref })} />
            </Field>
            {brand === "Sassy" ? (
              <Field label="Line beside it">
                <TextInput value={block.sisterBlurb} maxLength={200} onChange={(sisterBlurb) => onChange({ ...block, sisterBlurb })} />
              </Field>
            ) : null}
          </div>
          <Field label="Copyright line" hint="{year} becomes the current year.">
            <TextInput value={block.copyright} maxLength={160} onChange={(copyright) => onChange({ ...block, copyright })} />
          </Field>
        </div>
      );

    case "collections_copy":
      return <CollectionsCopyForm block={block} onChange={onChange} />;

    case "faq":
      return (
        <div className="space-y-4">
          <Field label="Section heading (optional)">
            <TextInput value={block.heading} maxLength={100} onChange={(heading) => onChange({ ...block, heading })} />
          </Field>
          <ObjList
            label="Questions"
            items={block.items}
            max={LIMITS.faqs}
            onChange={(items) => onChange({ ...block, items })}
            make={(id) => ({ id, q: "A question?", a: "" })}
            title={(x) => x.q}
            render={(x, set) => (
              <>
                <Field label="Question">
                  <TextInput value={x.q} maxLength={200} onChange={(q) => set({ q })} />
                </Field>
                <Field label="Answer">
                  <TextArea value={x.a} rows={4} maxLength={1200} onChange={(a) => set({ a })} />
                </Field>
              </>
            )}
          />
        </div>
      );
  }
}

function OpenPage({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-medium text-indigo-800 transition hover:bg-indigo-100"
    >
      {label}
      <span aria-hidden>→</span>
    </button>
  );
}

/** Editable label + link rows (footer columns). */
function LinkRows({ links, onChange }: { links: FooterLink[]; onChange: (links: FooterLink[]) => void }) {
  return (
    <div className="space-y-1.5">
      {links.map((l, i) => (
        <div key={l.id} className="flex items-center gap-1">
          <input
            className="w-[45%] rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-400"
            value={l.label}
            maxLength={60}
            placeholder="Text"
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <input
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-indigo-400"
            value={l.href}
            placeholder="/page"
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))}
          />
          <IconButton label="Move up" disabled={i === 0} onClick={() => onChange(move(links, i, i - 1))}>
            <span className="text-xs">↑</span>
          </IconButton>
          <IconButton label="Remove" danger onClick={() => onChange(links.filter((_, j) => j !== i))}>
            <X size={13} />
          </IconButton>
        </div>
      ))}
      {links.length < LIMITS.footerLinks ? (
        <button
          type="button"
          onClick={() => onChange([...links, { id: uid("link"), label: "", href: "/" }])}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Plus size={13} /> Add link
        </button>
      ) : null}
    </div>
  );
}

const PERSONA_NAME: Record<string, string> = Object.fromEntries(QUIZ_PERSONAS.map((p) => [p.key, p.name]));

/** The Find your Sassy quiz: results per persona, the questions with their
 *  scoring, and the scent tiebreaker. The number of questions and answers is
 *  fixed (the chat assistant and the scent branch rely on it); everything
 *  else is editable. */
function QuizForm({
  block,
  onChange,
  catalog,
}: {
  block: QuizBlock;
  onChange: (b: PageBlock) => void;
  catalog: CatalogItem[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const personaNames = Object.fromEntries(block.personas.map((p) => [p.key, p.name || PERSONA_NAME[p.key]]));
  const setPersona = (i: number, patch: Partial<QuizPersonaCopy>) =>
    onChange({ ...block, personas: block.personas.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setQuestion = (i: number, patch: Partial<QuizQuestion>) =>
    onChange({ ...block, questions: block.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const toggle = (id: string) => setOpen(open === id ? null : id);

  return (
    <div className="space-y-5">
      <Field label="Label on the homepage quiz card">
        <TextInput value={block.cardLabel} maxLength={40} onChange={(cardLabel) => onChange({ ...block, cardLabel })} />
      </Field>

      <div>
        <p className="text-xs font-medium text-gray-700">Results — one per persona</p>
        <p className="mb-2 text-[11px] text-gray-400">What a shopper sees when the quiz crowns her.</p>
        <div className="space-y-2">
          {block.personas.map((p, i) => (
            <ItemCard
              key={p.key}
              title={p.name}
              subtitle={`${p.scent} · ${p.tag}`}
              thumb={p.image}
              open={open === `p:${p.key}`}
              onToggle={() => toggle(`p:${p.key}`)}
            >
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name">
                  <TextInput value={p.name} maxLength={40} onChange={(name) => setPersona(i, { name })} />
                </Field>
                <Field label="Scent">
                  <TextInput value={p.scent} maxLength={60} onChange={(scent) => setPersona(i, { scent })} />
                </Field>
              </div>
              <Field label="Tagline">
                <TextInput value={p.tag} maxLength={160} onChange={(tag) => setPersona(i, { tag })} />
              </Field>
              <Field label="The crown line" hint="Her read — on the result card and in the chat.">
                <TextArea value={p.crown} rows={3} maxLength={400} onChange={(crown) => setPersona(i, { crown })} />
              </Field>
              <Field label="Photo" hint="Square, about 1080 × 1080.">
                <ImageInput value={p.image} onChange={(image) => setPersona(i, { image })} />
              </Field>
              <Field label="Her product">
                <select
                  value={p.part}
                  onChange={(e) => setPersona(i, { part: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                >
                  {p.part && !catalog.some((c) => c.part === p.part) ? <option value={p.part}>{p.part}</option> : null}
                  {catalog.map((c) => (
                    <option key={c.part} value={c.part}>
                      {c.name} ({c.part})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Her story (blog link)" hint="The part after /blog/, e.g. meet-the-queen.">
                <TextInput value={p.slug} maxLength={80} onChange={(slug) => setPersona(i, { slug })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Card background">
                  <ColorInput value={p.surface} onChange={(surface) => setPersona(i, { surface })} />
                </Field>
                <Field label="Card text">
                  <ColorInput value={p.ink} onChange={(ink) => setPersona(i, { ink })} />
                </Field>
                <Field label="Accent">
                  <ColorInput value={p.accent} onChange={(accent) => setPersona(i, { accent })} />
                </Field>
                <Field label="Text on accent">
                  <ColorInput value={p.accentInk} onChange={(accentInk) => setPersona(i, { accentInk })} />
                </Field>
              </div>
            </ItemCard>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700">Questions</p>
        <p className="mb-2 text-[11px] text-gray-400">
          Each answer gives points to personas (0–5); the highest total wins. The number of questions and answers is
          fixed — the chat assistant asks the same ones.
        </p>
        <div className="space-y-2">
          {block.questions.map((q, i) => (
            <ItemCard
              key={q.id}
              title={`${i + 1}. ${q.prompt}`}
              open={open === `q:${q.id}`}
              onToggle={() => toggle(`q:${q.id}`)}
            >
              <Field label="Question">
                <TextInput value={q.prompt} maxLength={200} onChange={(prompt) => setQuestion(i, { prompt })} />
              </Field>
              {q.options.map((o, j) => {
                const setOption = (patch: Partial<QuizOption>) =>
                  setQuestion(i, { options: q.options.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
                const scentBranch = i === block.questions.length - 1 && j === q.options.length - 1;
                return (
                  <div key={o.id} className="space-y-2 rounded-lg border border-gray-200 p-2.5">
                    <TextInput value={o.label} maxLength={120} onChange={(label) => setOption({ label })} />
                    {scentBranch ? (
                      <p className="text-[11px] text-indigo-700">This answer opens the scent question below.</p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-1.5">
                      {block.personas.map((p) => (
                        <label key={p.key} className="flex items-center justify-between gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                          <span className="truncate">{personaNames[p.key]}</span>
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={o.weights[p.key] ?? 0}
                            onChange={(e) => {
                              const n = Math.max(0, Math.min(5, Math.round(Number(e.target.value) || 0)));
                              const weights = { ...o.weights };
                              if (n) weights[p.key] = n;
                              else delete weights[p.key];
                              setOption({ weights });
                            }}
                            className="w-9 rounded border border-gray-200 bg-white px-1 py-0.5 text-right text-[11px] outline-none focus:border-indigo-400"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </ItemCard>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-700">Scent tiebreaker</p>
        <p className="text-[11px] text-gray-400">Only asked when the shopper says she chooses by scent. Each scent crowns its persona.</p>
        <Field label="Question">
          <TextInput value={block.scentPrompt} maxLength={200} onChange={(scentPrompt) => onChange({ ...block, scentPrompt })} />
        </Field>
        {block.scentOptions.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400"
              value={o.label}
              maxLength={60}
              onChange={(e) =>
                onChange({ ...block, scentOptions: block.scentOptions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
              }
            />
            <span className="shrink-0 text-[11px] text-gray-500">→ {personaNames[o.persona]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** NI fragrance collections: the words per collection (names stay in code). */
function CollectionsCopyForm({ block, onChange }: { block: CollectionsCopyBlock; onChange: (b: PageBlock) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, patch: Partial<CollectionCopy>) =>
    onChange({ ...block, items: block.items.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-2">
      {block.items.map((c, i) => (
        <ItemCard
          key={c.slug}
          title={c.name}
          subtitle={c.tagline}
          open={open === c.slug}
          onToggle={() => setOpen(open === c.slug ? null : c.slug)}
        >
          <Field label="Tagline" hint="Small line on tiles and above the name.">
            <TextInput value={c.tagline} maxLength={80} onChange={(tagline) => set(i, { tagline })} />
          </Field>
          <Field label="Scent story">
            <TextArea value={c.description} rows={4} maxLength={600} onChange={(description) => set(i, { description })} />
          </Field>
          <Field label="Three notes">
            <div className="space-y-1.5">
              {[0, 1, 2].map((k) => (
                <TextInput
                  key={k}
                  value={c.notes[k] ?? ""}
                  maxLength={60}
                  onChange={(v) => {
                    const notes = [0, 1, 2].map((x) => (x === k ? v : c.notes[x] ?? ""));
                    set(i, { notes });
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium text-gray-700">Hero slide (homepage + collection page)</p>
            <Field label="Small label">
              <TextInput value={c.heroLabel} maxLength={60} onChange={(heroLabel) => set(i, { heroLabel })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Headline">
                <TextInput value={c.heroTitle} maxLength={60} onChange={(heroTitle) => set(i, { heroTitle })} />
              </Field>
              <Field label="Headline, second line">
                <TextInput value={c.heroAccent} maxLength={60} onChange={(heroAccent) => set(i, { heroAccent })} />
              </Field>
            </div>
            <Field label="Paragraph">
              <TextArea value={c.heroDescription} rows={3} maxLength={600} onChange={(heroDescription) => set(i, { heroDescription })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Button">
                <TextInput value={c.heroCta} maxLength={40} onChange={(heroCta) => set(i, { heroCta })} />
              </Field>
              <Field label="Invitation">
                <TextInput value={c.heroInvitation} maxLength={120} onChange={(heroInvitation) => set(i, { heroInvitation })} />
              </Field>
              <Field label="Footer kicker">
                <TextInput value={c.heroKicker} maxLength={80} onChange={(heroKicker) => set(i, { heroKicker })} />
              </Field>
              <Field label="Footer line">
                <TextInput value={c.heroLine} maxLength={120} onChange={(heroLine) => set(i, { heroLine })} />
              </Field>
            </div>
          </div>
        </ItemCard>
      ))}
    </div>
  );
}

const CATALOG_SOURCE: Record<string, string> = {
  blog: " from the posts in Marketing → Blog Posts.",
  collections: " with a tile per fragrance collection.",
  ingredients: " with the ingredient glossary — reference data kept in the store's code.",
  "ingredients-by-product": " from each product's ingredient label in Products.",
};

const SEED_HINT = "Black Cumin, Pomegranate, Cranberry, Carrot or Grape get their botanical drawing.";

function SeedItems({ items, onChange }: { items: SeedItem[]; onChange: (items: SeedItem[]) => void }) {
  return (
    <ObjList
      label="Seeds"
      items={items}
      max={LIMITS.seeds}
      onChange={onChange}
      make={(id) => ({ id, name: "Black Cumin", note: "" })}
      title={(x) => x.name}
      subtitle={(x) => x.note}
      render={(x, set) => (
        <>
          <Field label="Seed" hint={SEED_HINT}>
            <TextInput value={x.name} maxLength={40} onChange={(name) => set({ name })} />
          </Field>
          <Field label="Note">
            <TextInput value={x.note} maxLength={200} onChange={(note) => set({ note })} />
          </Field>
        </>
      )}
    />
  );
}

/** Rich text (headings, bold, italic, lists, links) — the blog's editor. */
function RichField({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
      <RichTextEditor value={value} onChange={onChange} />
    </div>
  );
}

function HeaderFields({
  eyebrow,
  title,
  lede,
  onChange,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  onChange: (p: { eyebrow?: string; title?: string; lede?: string }) => void;
}) {
  return (
    <>
      <Field label="Small label">
        <TextInput value={eyebrow} maxLength={60} onChange={(v) => onChange({ eyebrow: v })} />
      </Field>
      <Field label="Title" hint="Wrap words in *stars* for the accent color. Enter makes a new line.">
        <TextArea value={title} rows={2} maxLength={160} onChange={(v) => onChange({ title: v })} />
      </Field>
      <Field label="Intro" hint="Links: [text](/page).">
        <TextArea value={lede} rows={3} maxLength={800} onChange={(v) => onChange({ lede: v })} />
      </Field>
    </>
  );
}

/** A repeating list of small objects shown as collapsible cards. */
function ObjList<T extends { id: string }>({
  label,
  items,
  max,
  onChange,
  make,
  title,
  subtitle,
  render,
}: {
  label: string;
  items: T[];
  max: number;
  onChange: (items: T[]) => void;
  make: (id: string) => T;
  title: (x: T) => string;
  subtitle?: (x: T) => string;
  render: (x: T, set: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Field label={label}>
      <div className="space-y-2">
        {items.map((x, i) => (
          <ItemCard
            key={x.id}
            title={title(x)}
            subtitle={subtitle?.(x)}
            open={open === x.id}
            onToggle={() => setOpen(open === x.id ? null : x.id)}
            onUp={i > 0 ? () => onChange(move(items, i, i - 1)) : undefined}
            onDown={i < items.length - 1 ? () => onChange(move(items, i, i + 1)) : undefined}
            onRemove={() => onChange(items.filter((_, j) => j !== i))}
          >
            {render(x, (patch) => onChange(items.map((y, j) => (j === i ? { ...y, ...patch } : y))))}
          </ItemCard>
        ))}
        {items.length < max ? (
          <button
            type="button"
            onClick={() => {
              const id = uid("item");
              onChange([...items, make(id)]);
              setOpen(id);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            <Plus size={13} /> Add
          </button>
        ) : null}
      </div>
    </Field>
  );
}

function LinkFields({
  title,
  label,
  href,
  onChange,
}: {
  title: string;
  label: string;
  href: string;
  onChange: (label: string, href: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label={`${title} text`}>
        <TextInput value={label} maxLength={40} onChange={(v) => onChange(v, href)} />
      </Field>
      <Field label={`${title} link`}>
        <TextInput value={href} placeholder="/shop" onChange={(v) => onChange(label, v)} />
      </Field>
      <p className="col-span-2 -mt-1 text-[11px] text-gray-400">{LINK_HINT} Leave blank to hide.</p>
    </div>
  );
}

function PartPicker({
  parts,
  catalog,
  onChange,
}: {
  parts: string[];
  catalog: CatalogItem[];
  onChange: (parts: string[]) => void;
}) {
  const byPart = new Map(catalog.map((c) => [c.part, c.name]));
  const available = catalog.filter((c) => !parts.includes(c.part));
  return (
    <Field label="Products" hint="In this order. Unpublished products are skipped on the site.">
      <div className="space-y-1.5">
        {parts.map((p, i) => (
          <div key={p} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-900">{byPart.get(p) ?? p}</div>
              <div className="font-mono text-[10px] text-gray-400">
                {p}
                {byPart.has(p) ? "" : " · not on the store"}
              </div>
            </div>
            <IconButton label="Move up" onClick={() => onChange(move(parts, i, i - 1))} disabled={i === 0}>
              <span className="text-xs">↑</span>
            </IconButton>
            <IconButton label="Move down" onClick={() => onChange(move(parts, i, i + 1))} disabled={i === parts.length - 1}>
              <span className="text-xs">↓</span>
            </IconButton>
            <IconButton label="Remove" onClick={() => onChange(parts.filter((x) => x !== p))} danger>
              <X size={13} />
            </IconButton>
          </div>
        ))}
        {parts.length < LIMITS.pickParts ? (
          <select
            value=""
            onChange={(e) => e.target.value && onChange([...parts, e.target.value])}
            className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 outline-none focus:border-indigo-400"
          >
            <option value="">+ Add a product…</option>
            {available.map((c) => (
              <option key={c.part} value={c.part}>
                {c.name} ({c.part})
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </Field>
  );
}

function HeroForm({
  slides,
  onChange,
  catalog,
}: {
  slides: HeroSlide[];
  onChange: (s: HeroSlide[]) => void;
  catalog: CatalogItem[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, patch: Partial<HeroSlide>) =>
    onChange(slides.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Photos rotate every 6 seconds. The quiz card sits on the right and always stays — when the quiz crowns a
        persona, the hero locks to the slide tagged with her.
      </p>
      {slides.map((s, i) => (
        <ItemCard
          key={s.id}
          title={s.name}
          subtitle={s.blurb}
          thumb={s.desktopImage}
          open={open === s.id}
          onToggle={() => setOpen(open === s.id ? null : s.id)}
          onUp={i > 0 ? () => onChange(move(slides, i, i - 1)) : undefined}
          onDown={i < slides.length - 1 ? () => onChange(move(slides, i, i + 1)) : undefined}
          onRemove={slides.length > 1 ? () => onChange(slides.filter((_, j) => j !== i)) : undefined}
        >
          <Field label="Headline">
            <TextInput value={s.name} maxLength={60} onChange={(name) => set(i, { name })} />
          </Field>
          <Field label="Tagline">
            <TextInput value={s.blurb} maxLength={160} onChange={(blurb) => set(i, { blurb })} />
          </Field>
          <Field label="Desktop photo" hint="Wide, about 1920 × 1067.">
            <ImageInput value={s.desktopImage} onChange={(desktopImage) => set(i, { desktopImage })} />
          </Field>
          <Field label="Phone photo" hint="Square, about 1080 × 1080.">
            <ImageInput
              value={s.mobileImage}
              onChange={(mobileImage) => set(i, { mobileImage })}
              optional="Uses the desktop photo."
            />
          </Field>
          <Field label="“Shop” button goes to">
            <select
              value={s.part}
              onChange={(e) => set(i, { part: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
            >
              <option value="">No button</option>
              {s.part && !catalog.some((c) => c.part === s.part) ? (
                <option value={s.part}>{s.part}</option>
              ) : null}
              {catalog.map((c) => (
                <option key={c.part} value={c.part}>
                  {c.name} ({c.part})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Accent color">
              <ColorInput value={s.accent} onChange={(accent) => set(i, { accent })} />
            </Field>
            <Field label="Quiz persona">
              <Select
                value={s.persona}
                onChange={(persona) => set(i, { persona })}
                options={[{ value: "", label: "None" }, ...QUIZ_PERSONAS.map((p) => ({ value: p.key, label: p.name }))]}
              />
            </Field>
          </div>
        </ItemCard>
      ))}
      {slides.length < LIMITS.slides ? (
        <button
          type="button"
          onClick={() => {
            const id = uid("slide");
            onChange([
              ...slides,
              { id, name: "New slide", blurb: "", part: "", accent: "#E8488E", desktopImage: "", mobileImage: "", persona: "" },
            ]);
            setOpen(id);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Plus size={13} /> Add slide
        </button>
      ) : null}
    </div>
  );
}

function TilesForm({ tiles, onChange }: { tiles: FormTile[]; onChange: (t: FormTile[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, patch: Partial<FormTile>) =>
    onChange(tiles.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <Field label="Tiles">
      <div className="space-y-2">
        {tiles.map((t, i) => (
          <ItemCard
            key={t.id}
            title={t.label}
            subtitle={t.blurb}
            thumb={t.image}
            open={open === t.id}
            onToggle={() => setOpen(open === t.id ? null : t.id)}
            onUp={i > 0 ? () => onChange(move(tiles, i, i - 1)) : undefined}
            onDown={i < tiles.length - 1 ? () => onChange(move(tiles, i, i + 1)) : undefined}
            onRemove={() => onChange(tiles.filter((_, j) => j !== i))}
          >
            <Field label="Name">
              <TextInput value={t.label} maxLength={40} onChange={(label) => set(i, { label })} />
            </Field>
            <Field label="Line under it">
              <TextInput value={t.blurb} maxLength={120} onChange={(blurb) => set(i, { blurb })} />
            </Field>
            <Field label="Photo">
              <ImageInput
                value={t.image}
                onChange={(image) => set(i, { image })}
                optional="Uses a matching product's photo."
              />
            </Field>
            <Field label="Products that count" hint="Words in the product form, comma-separated — e.g. lip, or gift, set.">
              <TextInput value={t.match} maxLength={120} onChange={(match) => set(i, { match })} />
            </Field>
            <Field label="Shop filter" hint="The form filter the tile opens on /shop (e.g. lip butter).">
              <TextInput value={t.shopType} maxLength={60} onChange={(shopType) => set(i, { shopType })} />
            </Field>
          </ItemCard>
        ))}
        {tiles.length < LIMITS.tiles ? (
          <button
            type="button"
            onClick={() => {
              const id = uid("tile");
              onChange([...tiles, { id, label: "New tile", blurb: "", shopType: "", match: "", image: "" }]);
              setOpen(id);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            <Plus size={13} /> Add tile
          </button>
        ) : null}
      </div>
    </Field>
  );
}
