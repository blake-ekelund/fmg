"use client";

import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  Copy,
  ImagePlus,
  Lock,
  LockOpen,
  Maximize,
  Package,
  SendToBack,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import {
  TEXTURES,
  paletteFor,
  type Palette,
  type CanvasBackground,
  type CanvasSlide,
  type ImageLayer,
  type Layer,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
  slideH,
  slideW,
} from "@/lib/social/canvas";
import { fontById, fontsForBrand, BRAND_FONTS } from "@/lib/social/fonts";
import type { SocialBrand } from "@/lib/social/types";
import { ColorField, IconButton, NumberInput, Row, Section, Segment, Slider, Toggle } from "./controls";

export type LayerAction = "duplicate" | "delete" | "front" | "back" | "forward" | "backward" | "lock" | "fill" | "toBackground";
export type ImageTarget = "layer" | "background" | "new";

type Props = {
  brand: SocialBrand;
  slide: CanvasSlide;
  layer: Layer | null;
  /** `key` groups rapid changes (typing, sliding) into one undo step. */
  onLayer: (id: string, patch: Partial<Layer>, key?: string) => void;
  onBackground: (patch: Partial<CanvasBackground>, key?: string) => void;
  onAction: (a: LayerAction) => void;
  onPickImage: (target: ImageTarget) => void;
  onPickProduct: (target: ImageTarget) => void;
};

export default function CanvasInspector(p: Props) {
  const palette = paletteFor(p.brand);
  if (!p.layer) return <BackgroundPanel {...p} palette={palette} />;
  const l = p.layer;
  const set = (patch: Partial<Layer>, key?: string) => p.onLayer(l.id, patch, key);
  const W = slideW(p.slide);
  const H = slideH(p.slide);

  return (
    <div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 border-b border-gray-100 px-3 py-2">
        <span className="mr-auto pl-1 text-sm font-semibold text-gray-900">
          {l.type === "text" ? "Text" : l.type === "image" ? "Photo" : "Shape"}
        </span>
        <IconButton title="Duplicate (Ctrl+D)" onClick={() => p.onAction("duplicate")}><Copy size={16} /></IconButton>
        <IconButton title={l.locked ? "Unlock" : "Lock in place"} active={l.locked} onClick={() => p.onAction("lock")}>
          {l.locked ? <Lock size={16} /> : <LockOpen size={16} />}
        </IconButton>
        <IconButton title="Bring to front" onClick={() => p.onAction("front")}><BringToFront size={16} /></IconButton>
        <IconButton title="Send to back" onClick={() => p.onAction("back")}><SendToBack size={16} /></IconButton>
        <IconButton title="Delete (Del)" danger onClick={() => p.onAction("delete")}><Trash2 size={16} /></IconButton>
      </div>

      {l.type === "text" && <TextPanel l={l} set={set} brand={p.brand} palette={palette} />}
      {l.type === "image" && <ImagePanel l={l} set={set} palette={palette} onAction={p.onAction} onPickImage={p.onPickImage} onPickProduct={p.onPickProduct} />}
      {l.type === "shape" && <ShapePanel l={l} set={set} palette={palette} />}

      <Section title="Position">
        <div className="flex gap-1">
          <IconButton title="Align left on slide" onClick={() => set({ x: 0 })}><AlignHorizontalJustifyStart size={16} /></IconButton>
          <IconButton title="Center horizontally" onClick={() => set({ x: Math.round((W - l.w) / 2) })}><AlignHorizontalJustifyCenter size={16} /></IconButton>
          <IconButton title="Align right on slide" onClick={() => set({ x: W - l.w })}><AlignHorizontalJustifyEnd size={16} /></IconButton>
          <span className="mx-1 w-px bg-gray-200" />
          <IconButton title="Align top" onClick={() => set({ y: 0 })}><AlignVerticalJustifyStart size={16} /></IconButton>
          <IconButton title="Center vertically" onClick={() => set({ y: Math.round((H - l.h) / 2) })}><AlignVerticalJustifyCenter size={16} /></IconButton>
          <IconButton title="Align bottom" onClick={() => set({ y: H - l.h })}><AlignVerticalJustifyEnd size={16} /></IconButton>
        </div>
        <div className="flex gap-2">
          <NumberInput label="X" value={l.x} onChange={(x) => set({ x })} />
          <NumberInput label="Y" value={l.y} onChange={(y) => set({ y })} />
        </div>
        <div className="flex gap-2">
          <NumberInput label="W" value={l.w} min={8} onChange={(w) => set(l.type === "image" ? { w, h: Math.round((l.h / l.w) * w) } : { w })} />
          {l.type !== "text" && <NumberInput label="H" value={l.h} min={2} onChange={(h) => set({ h })} />}
        </div>
        <Row label="Rotation">
          <Slider value={l.rotation} min={-180} max={180} onChange={(rotation) => set({ rotation }, "rotation")} suffix="°" />
        </Row>
        <Row label="Opacity">
          <Slider value={l.opacity} min={0} max={1} step={0.01} onChange={(opacity) => set({ opacity }, "opacity")} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
      </Section>

      <div className="flex gap-1 px-4 py-3">
        <button type="button" onClick={() => p.onAction("forward")} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
          <ArrowUpToLine size={14} /> Forward
        </button>
        <button type="button" onClick={() => p.onAction("backward")} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
          <ArrowDownToLine size={14} /> Backward
        </button>
      </div>
    </div>
  );
}

/* ─── Text ────────────────────────────────────────────────────────── */

function TextPanel({ l, set, brand, palette }: { l: TextLayer; set: (p: Partial<TextLayer>, key?: string) => void; brand: SocialBrand; palette: Palette }) {
  const fonts = fontsForBrand(brand);
  const fam = fontById(l.font);
  const weights = [...new Set(fam.variants.filter((v) => v.style === "normal").map((v) => v.weight))];
  const hasItalic = fam.variants.some((v) => v.style === "italic");
  const brandIds = BRAND_FONTS[brand];

  return (
    <>
      <Section title="Text">
        <textarea
          value={l.text}
          onChange={(e) => set({ text: e.target.value }, "text")}
          rows={3}
          className="w-full resize-y rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-violet-400 focus:outline-none"
        />
        <p className="text-[11px] text-gray-400">Tip: double-click text on the slide to type right there.</p>
      </Section>
      <Section title="Font">
        <select
          value={l.font}
          onChange={(e) => {
            const f = fontById(e.target.value);
            const w = f.variants.reduce((a, b) => (Math.abs(b.weight - l.weight) < Math.abs(a.weight - l.weight) ? b : a)).weight;
            set({ font: f.id, weight: w, italic: l.italic && f.variants.some((v) => v.style === "italic") });
          }}
          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:border-violet-400 focus:outline-none"
          style={{ fontFamily: `"${fam.family}"` }}
        >
          <optgroup label="Brand fonts">
            {fonts.filter((f) => brandIds.includes(f.id)).map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          {(["serif", "sans", "display", "script"] as const).map((k) => (
            <optgroup key={k} label={{ serif: "Serif", sans: "Sans serif", display: "Display", script: "Handwritten" }[k]}>
              {fonts.filter((f) => f.kind === k && !brandIds.includes(f.id)).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          {weights.length > 1 && (
            <Segment
              options={weights.map((w) => ({ value: String(w), label: w >= 700 ? "Bold" : w >= 600 ? "Semi" : w >= 500 ? "Medium" : "Regular" }))}
              value={String(l.weight)}
              onChange={(w) => set({ weight: Number(w) })}
            />
          )}
          {hasItalic && <Toggle on={l.italic} onChange={(italic) => set({ italic })} label="Italic" />}
          <Toggle on={l.uppercase} onChange={(uppercase) => set({ uppercase })} label="ABC" />
        </div>
        <Row label="Size">
          <Slider value={l.size} min={10} max={240} onChange={(size) => set({ size }, "size")} suffix="px" />
        </Row>
        <Row label="Color">
          <ColorField value={l.color} onChange={(c) => c && set({ color: c })} palette={palette} />
        </Row>
        <Row label="Align">
          <Segment
            options={[
              { value: "left", label: <AlignLeft size={15} />, title: "Left" },
              { value: "center", label: <AlignCenter size={15} />, title: "Center" },
              { value: "right", label: <AlignRight size={15} />, title: "Right" },
            ]}
            value={l.align}
            onChange={(align) => set({ align })}
          />
        </Row>
        <Row label="Line height">
          <Slider value={l.lineHeight} min={0.7} max={2.2} step={0.05} onChange={(lineHeight) => set({ lineHeight }, "lh")} />
        </Row>
        <Row label="Spacing">
          <Slider value={l.letterSpacing} min={-5} max={30} step={0.5} onChange={(letterSpacing) => set({ letterSpacing }, "ls")} suffix="px" />
        </Row>
      </Section>
      <Section title="Highlight">
        <Row label="Color">
          <ColorField value={l.bg} onChange={(bg) => set({ bg, padding: bg && !l.padding ? 16 : l.padding })} palette={palette} allowNone />
        </Row>
        {l.bg && (
          <>
            <Row label="Padding">
              <Slider value={l.padding} min={0} max={80} onChange={(padding) => set({ padding }, "pad")} suffix="px" />
            </Row>
            <Row label="Rounding">
              <Slider value={l.bgRadius} min={0} max={200} onChange={(bgRadius) => set({ bgRadius }, "bgr")} suffix="px" />
            </Row>
          </>
        )}
      </Section>
    </>
  );
}

/* ─── Image ───────────────────────────────────────────────────────── */

function ImagePanel({
  l,
  set,
  palette,
  onAction,
  onPickImage,
  onPickProduct,
}: {
  l: ImageLayer;
  set: (p: Partial<ImageLayer>, key?: string) => void;
  palette: Palette;
  onAction: (a: LayerAction) => void;
  onPickImage: (t: ImageTarget) => void;
  onPickProduct: (t: ImageTarget) => void;
}) {
  return (
    <Section title="Photo">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={l.src} alt="" className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={() => onPickImage("layer")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-gray-900">
            <ImagePlus size={14} /> Replace from library
          </button>
          <button type="button" onClick={() => onPickProduct("layer")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-gray-900">
            <Package size={14} /> Replace with product photo
          </button>
        </div>
      </div>
      <Row label="Fit">
        <Segment
          options={[
            { value: "cover", label: "Fill frame", title: "Crop to fill the frame" },
            { value: "contain", label: "Show whole", title: "Show the whole photo" },
          ]}
          value={l.fit}
          onChange={(fit) => set({ fit })}
        />
      </Row>
      <Row label="Rounding">
        <Slider value={l.radius} min={0} max={Math.round(Math.min(l.w, l.h) / 2)} onChange={(radius) => set({ radius }, "radius")} suffix="px" />
      </Row>
      <Row label="Border">
        <Slider value={l.borderWidth} min={0} max={40} onChange={(borderWidth) => set({ borderWidth }, "bw")} suffix="px" />
      </Row>
      {l.borderWidth > 0 && (
        <Row label="Border color">
          <ColorField value={l.borderColor} onChange={(c) => c && set({ borderColor: c })} palette={palette} />
        </Row>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => onAction("fill")} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Maximize size={13} /> Fill the slide
        </button>
        <button type="button" onClick={() => onAction("toBackground")} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Make it the background
        </button>
      </div>
    </Section>
  );
}

/* ─── Shape ───────────────────────────────────────────────────────── */

function ShapePanel({ l, set, palette }: { l: ShapeLayer; set: (p: Partial<ShapeLayer>, key?: string) => void; palette: Palette }) {
  return (
    <Section title="Shape">
      <Row label="Shape">
        <Segment<ShapeKind>
          options={[
            { value: "rect", label: "Rectangle" },
            { value: "ellipse", label: "Circle" },
            { value: "arch", label: "Arch" },
            { value: "line", label: "Line" },
          ]}
          value={l.shape}
          onChange={(shape) => set({ shape, ...(shape === "line" ? { h: Math.min(l.h, 12) } : l.shape === "line" ? { h: l.w } : {}) })}
        />
      </Row>
      <Row label="Fill">
        <ColorField value={l.gradient ? null : l.fill} onChange={(c) => set({ fill: c ?? "transparent", gradient: null })} palette={palette} allowNone />
      </Row>
      {l.gradient && <p className="text-[11px] text-gray-400">This shape has a gradient from its template — pick a color to replace it.</p>}
      {l.shape === "rect" && (
        <Row label="Rounding">
          <Slider value={l.radius} min={0} max={Math.round(Math.min(l.w, l.h) / 2)} onChange={(radius) => set({ radius }, "radius")} suffix="px" />
        </Row>
      )}
      {l.shape !== "line" && (
        <>
          <Row label="Outline">
            <Slider value={l.strokeWidth} min={0} max={40} onChange={(strokeWidth) => set({ strokeWidth }, "sw")} suffix="px" />
          </Row>
          {l.strokeWidth > 0 && (
            <Row label="Outline color">
              <ColorField value={l.stroke} onChange={(c) => c && set({ stroke: c })} palette={palette} />
            </Row>
          )}
        </>
      )}
    </Section>
  );
}

/* ─── Background ──────────────────────────────────────────────────── */

function BackgroundPanel({ brand, slide, onBackground, onPickImage, onPickProduct, palette }: Props & { palette: Palette }) {
  const bg = slide.bg;
  const set = (patch: Partial<CanvasBackground>, key?: string) => onBackground(patch, key);
  return (
    <div>
      <div className="border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-semibold text-gray-900">Slide background</span>
        <p className="mt-0.5 text-xs text-gray-500">Click anything on the slide to edit it. Use + Add above the slide for text, photos, shapes and new slides.</p>
      </div>
      <Section title="Color">
        <Row label="Color">
          <ColorField value={bg.color} onChange={(c) => c && set({ color: c })} palette={palette} />
        </Row>
        <Row label="Gradient">
          <Toggle on={!!bg.gradient} onChange={(on) => set({ gradient: on ? { to: paletteFor(brand).brand[1] ?? "#FFFFFF", angle: 180 } : null })} label={bg.gradient ? "On" : "Off"} />
        </Row>
        {bg.gradient && (
          <>
            <Row label="Fades to">
              <ColorField value={bg.gradient.to} onChange={(c) => c && set({ gradient: { ...bg.gradient!, to: c } })} palette={palette} />
            </Row>
            <Row label="Direction">
              <Slider value={bg.gradient.angle} min={0} max={360} step={15} onChange={(angle) => set({ gradient: { ...bg.gradient!, angle } }, "angle")} suffix="°" />
            </Row>
          </>
        )}
      </Section>
      <Section title="Background photo">
        {bg.image ? (
          <>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bg.image} alt="" className="h-16 w-14 rounded-lg border border-gray-200 object-cover" />
              <div className="flex flex-col items-start gap-1">
                <button type="button" onClick={() => onPickImage("background")} className="text-[13px] font-medium text-gray-700 hover:text-gray-900">Replace</button>
                <button type="button" onClick={() => set({ image: "" })} className="text-[13px] text-gray-400 hover:text-red-600">Remove</button>
              </div>
            </div>
            <Row label="Opacity">
              <Slider value={bg.imageOpacity} min={0} max={1} step={0.01} onChange={(imageOpacity) => set({ imageOpacity }, "bgop")} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
          </>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <button type="button" onClick={() => onPickImage("background")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-gray-900">
              <ImagePlus size={14} /> Choose from library
            </button>
            <button type="button" onClick={() => onPickProduct("background")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 hover:text-gray-900">
              <Package size={14} /> Use a product photo
            </button>
          </div>
        )}
      </Section>
      <Section title="Texture">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => set({ texture: null })}
            className={clsx("flex h-14 items-center justify-center rounded-lg border text-[11px] text-gray-500", !bg.texture ? "border-violet-600 ring-2 ring-violet-200" : "border-gray-200")}
          >
            None
          </button>
          {TEXTURES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => set({ texture: t.id })}
              className={clsx("relative h-14 overflow-hidden rounded-lg border", bg.texture === t.id ? "border-violet-600 ring-2 ring-violet-200" : "border-gray-200")}
              style={{ background: bg.color }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/textures/social/${t.id}-${bg.textureTone}.png`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
              <span className="absolute inset-x-0 bottom-0 bg-white/80 text-[10px] text-gray-700">{t.label}</span>
            </button>
          ))}
        </div>
        {bg.texture && (
          <>
            <Row label="Ink">
              <Segment
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
                value={bg.textureTone}
                onChange={(textureTone) => set({ textureTone })}
              />
            </Row>
            <Row label="Covers">
              <Segment
                options={[
                  { value: "bg", label: "Background" },
                  { value: "all", label: "Everything", title: "Over photos and shapes too" },
                ]}
                value={bg.textureOnTop ? "all" : "bg"}
                onChange={(v) => set({ textureOnTop: v === "all" })}
              />
            </Row>
            <Row label="Strength">
              <Slider value={bg.textureOpacity} min={0.05} max={1} step={0.01} onChange={(textureOpacity) => set({ textureOpacity }, "texop")} format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}
