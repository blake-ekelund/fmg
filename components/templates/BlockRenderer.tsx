"use client";

import type { EmailBlock } from "./types";
import {
  Facebook,
  Instagram,
  Globe,
  Music2,
  Tag,
} from "lucide-react";

/* ─── Renders a single block in the email preview ─── */
export default function BlockRenderer({
  block,
  selected,
  onSelect,
}: {
  block: EmailBlock;
  selected: boolean;
  onSelect: () => void;
}) {
  const outline = selected
    ? "ring-2 ring-blue-500 ring-offset-1"
    : "ring-1 ring-transparent hover:ring-gray-300";

  const wrap = (children: React.ReactNode) => (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={`relative cursor-pointer transition-all ${outline} rounded`}
    >
      {children}
    </div>
  );

  switch (block.type) {
    case "header":
      return wrap(
        <div
          style={{ backgroundColor: block.bgColor, color: block.textColor, padding: block.padding }}
          className="text-center"
        >
          {block.logoUrl ? (
            <img src={block.logoUrl} alt={block.companyName} className="h-10 mx-auto mb-1" />
          ) : (
            <div className="text-lg font-bold tracking-wide">{block.companyName}</div>
          )}
        </div>
      );

    case "text":
      return wrap(
        <div
          style={{
            fontSize: block.fontSize,
            textAlign: block.textAlign,
            color: block.textColor,
            backgroundColor: block.bgColor,
            padding: block.padding,
            fontFamily: block.fontFamily === "serif" ? "Georgia, serif" : block.fontFamily === "mono" ? "monospace" : "system-ui, sans-serif",
          }}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );

    case "image":
      return wrap(
        <div style={{ padding: block.padding, textAlign: block.align }}>
          {block.src ? (
            <img
              src={block.src}
              alt={block.alt}
              style={{
                borderRadius: block.borderRadius,
                width: block.width === "full" ? "100%" : block.width === "half" ? "50%" : "33%",
                display: "inline-block",
              }}
            />
          ) : (
            <div
              className="bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm"
              style={{
                height: 160,
                borderRadius: block.borderRadius,
                width: block.width === "full" ? "100%" : block.width === "half" ? "50%" : "33%",
                display: "inline-flex",
              }}
            >
              Drop image URL here
            </div>
          )}
        </div>
      );

    case "button":
      return wrap(
        <div style={{ padding: block.padding, textAlign: block.align }}>
          <a
            href={block.url}
            onClick={(e) => e.preventDefault()}
            style={{
              display: "inline-block",
              backgroundColor: block.bgColor,
              color: block.textColor,
              borderRadius: block.borderRadius,
              fontSize: block.fontSize,
              padding: "12px 32px",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            {block.text}
          </a>
        </div>
      );

    case "divider":
      return wrap(
        <div style={{ padding: block.padding }}>
          <hr
            style={{
              borderTop: `${block.thickness}px ${block.style} ${block.color}`,
              borderBottom: "none",
              borderLeft: "none",
              borderRight: "none",
            }}
          />
        </div>
      );

    case "spacer":
      return wrap(
        <div style={{ height: block.height }} className="bg-transparent" />
      );

    case "columns":
      return wrap(
        <div
          style={{ padding: block.padding, gap: block.gap, display: "grid", gridTemplateColumns: `repeat(${block.columns}, 1fr)` }}
        >
          {block.items.map((col, i) => (
            <div key={i} className="text-center">
              {col.imageUrl && <img src={col.imageUrl} alt={col.heading} className="w-full rounded mb-2" />}
              <div className="font-semibold text-sm text-gray-800">{col.heading}</div>
              <div className="text-xs text-gray-500 mt-1">{col.text}</div>
            </div>
          ))}
        </div>
      );

    case "product":
      return wrap(
        <div style={{ padding: block.padding, backgroundColor: block.bgColor }} className="flex gap-4 items-center">
          {block.imageUrl ? (
            <img src={block.imageUrl} alt={block.name} className="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
          ) : (
            <div className="w-24 h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex-shrink-0 flex items-center justify-center text-xs text-gray-400">
              Image
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800">{block.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">{block.description}</div>
            <div className="flex items-center gap-3 mt-2">
              <span className="font-bold text-gray-900">{block.price}</span>
              <a
                href={block.buttonUrl}
                onClick={(e) => e.preventDefault()}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-gray-900 text-white"
              >
                {block.buttonText}
              </a>
            </div>
          </div>
        </div>
      );

    case "social":
      return wrap(
        <div style={{ padding: block.padding, textAlign: block.align }} className="flex items-center justify-center gap-4">
          {block.instagram && <a href={block.instagram} onClick={(e) => e.preventDefault()} className="text-gray-500 hover:text-pink-500"><Instagram size={20} /></a>}
          {block.facebook && <a href={block.facebook} onClick={(e) => e.preventDefault()} className="text-gray-500 hover:text-blue-600"><Facebook size={20} /></a>}
          {block.tiktok && <a href={block.tiktok} onClick={(e) => e.preventDefault()} className="text-gray-500 hover:text-gray-900"><Music2 size={20} /></a>}
          {block.website && <a href={block.website} onClick={(e) => e.preventDefault()} className="text-gray-500 hover:text-emerald-600"><Globe size={20} /></a>}
          {!block.instagram && !block.facebook && !block.tiktok && !block.website && (
            <span className="text-xs text-gray-400">Add social links in the editor</span>
          )}
        </div>
      );

    case "hero":
      return wrap(
        <div className="relative" style={{ padding: block.padding }}>
          {block.imageUrl ? (
            <img src={block.imageUrl} alt={block.heading} className="w-full h-64 object-cover" />
          ) : (
            <div className="w-full h-64 bg-gradient-to-br from-gray-200 to-gray-300" />
          )}
          {block.overlay && (
            <div className="absolute inset-0 bg-black/40" style={{ margin: block.padding }} />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8" style={{ color: block.textColor, margin: block.padding }}>
            <h2 className="text-2xl font-bold">{block.heading}</h2>
            <p className="text-sm mt-2 opacity-90">{block.subheading}</p>
            {block.buttonText && (
              <a
                href={block.buttonUrl}
                onClick={(e) => e.preventDefault()}
                className="mt-4 inline-block px-6 py-2 rounded-lg font-semibold text-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#1a1a1a" }}
              >
                {block.buttonText}
              </a>
            )}
          </div>
        </div>
      );

    case "promotion":
      return wrap(
        <div style={{ padding: block.padding, backgroundColor: block.bgColor, color: block.textColor }}>
          <div className="rounded-xl border-2 border-dashed overflow-hidden" style={{ borderColor: block.accentColor }}>
            {/* Accent top bar */}
            <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: block.accentColor }}>
              <Tag size={16} className="text-white" />
              <span className="text-white font-bold text-sm tracking-wide">
                {block.discountLabel || "SPECIAL OFFER"}
              </span>
            </div>
            {/* Content */}
            <div className="px-5 py-4 text-center">
              <h3 className="text-lg font-bold" style={{ color: block.textColor }}>
                {block.headline || "Promotion Title"}
              </h3>
              <p className="text-sm mt-1 opacity-80" style={{ color: block.textColor }}>
                {block.description || "Promotion details here."}
              </p>
              {block.promoCode && (
                <div className="mt-3 inline-block border-2 border-dashed rounded-lg px-5 py-2" style={{ borderColor: block.accentColor }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Use Code</span>
                  <div className="text-lg font-bold font-mono tracking-widest" style={{ color: block.accentColor }}>
                    {block.promoCode}
                  </div>
                </div>
              )}
              {block.expiresLabel && (
                <div className="text-xs mt-2 opacity-60">{block.expiresLabel}</div>
              )}
              {block.buttonText && (
                <div className="mt-4">
                  <a
                    href={block.buttonUrl}
                    onClick={(e) => e.preventDefault()}
                    className="inline-block px-6 py-2.5 rounded-lg font-semibold text-sm text-white"
                    style={{ backgroundColor: block.accentColor }}
                  >
                    {block.buttonText}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
