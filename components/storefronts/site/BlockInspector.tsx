"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  LIMITS,
  QUIZ_PERSONAS,
  type FormTile,
  type HeroSlide,
  type PageBlock,
  type Tone,
} from "@/lib/site/pageBlocks";
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
}: {
  block: PageBlock;
  onChange: (b: PageBlock) => void;
  catalog: CatalogItem[];
}) {
  switch (block.type) {
    case "hero":
      return <HeroForm slides={block.slides} onChange={(slides) => onChange({ ...block, slides })} catalog={catalog} />;

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
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            The signup gives the WELCOME15 code — the offer itself is set in Discounts, not here.
          </p>
        </div>
      );
  }
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
