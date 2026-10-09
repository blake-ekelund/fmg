/**
 * One designed slide at full size (1080×1350). The SAME component renders the
 * editor preview (scaled with CSS) and the posted JPEG (next/og ImageResponse
 * → Satori), so it sticks to what Satori supports: inline styles, flexbox
 * only, every element with more than one child is display:flex, no CSS
 * classes, no grid.
 */

import type { CSSProperties, ReactNode } from "react";
import { SLIDE_H, SLIDE_THEMES, SLIDE_W, type Slide } from "./design";
import type { SocialBrand } from "./types";

type Props = {
  slide: Slide;
  brand: SocialBrand;
  /** 1-based position and total, for the page marker on carousels. */
  index: number;
  total: number;
};

const PAD = 88;

function headSize(text: string, upper: boolean): number {
  const n = text.length;
  const base = n <= 18 ? 104 : n <= 36 ? 88 : n <= 64 ? 72 : n <= 100 ? 60 : 52;
  return Math.round(upper ? base * 0.86 : base);
}

export default function SlideView({ slide: s, brand, index, total }: Props) {
  const t = SLIDE_THEMES[brand];
  const tone = t.tones[s.tone];

  const head = (text: string, size?: number, extra: CSSProperties = {}): ReactNode => (
    <div
      style={{
        display: "flex",
        fontFamily: t.headFont,
        fontWeight: t.headWeight,
        fontSize: size ?? headSize(text, t.headUpper),
        lineHeight: t.headUpper ? 1.02 : 1.08,
        letterSpacing: t.headTracking,
        textTransform: t.headUpper ? "uppercase" : "none",
        ...extra,
      }}
    >
      {text}
    </div>
  );

  const kicker = (color: string): ReactNode =>
    s.kicker ? (
      <div
        style={{
          display: "flex",
          fontFamily: t.bodyFont,
          fontWeight: 600,
          fontSize: 26,
          letterSpacing: 5,
          textTransform: "uppercase",
          color,
          marginBottom: 28,
        }}
      >
        {s.kicker}
      </div>
    ) : null;

  const body = (text: string, color: string, size = 38, extra: CSSProperties = {}): ReactNode =>
    text ? (
      <div
        style={{
          display: "flex",
          fontFamily: t.bodyFont,
          fontWeight: 400,
          fontSize: size,
          lineHeight: 1.4,
          color,
          ...extra,
        }}
      >
        {text}
      </div>
    ) : null;

  const footer = (color: string): ReactNode => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: t.bodyFont,
        fontWeight: 600,
        fontSize: 20,
        letterSpacing: 6,
        color,
      }}
    >
      <div style={{ display: "flex" }}>{t.wordmark}</div>
      <div style={{ display: "flex", letterSpacing: 2 }}>{total > 1 ? `${index} / ${total}` : ""}</div>
    </div>
  );

  const frame: CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    background: tone.bg,
    color: tone.ink,
  };

  const fullImage = (src: string): ReactNode =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={SLIDE_W}
        height={SLIDE_H}
        style={{ position: "absolute", top: 0, left: 0, width: SLIDE_W, height: SLIDE_H, objectFit: "cover" }}
      />
    ) : null;

  switch (s.layout) {
    case "cover": {
      const onPhoto = !!s.image;
      const ink = onPhoto ? "#FFFFFF" : tone.ink;
      return (
        <div style={frame}>
          {fullImage(s.image)}
          {onPhoto && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: SLIDE_W,
                height: SLIDE_H,
                display: "flex",
                backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.05) 70%, rgba(0,0,0,0.25) 100%)",
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: PAD, position: "relative" }}>
            {footer(onPhoto ? "rgba(255,255,255,0.92)" : tone.muted)}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {kicker(onPhoto ? "rgba(255,255,255,0.9)" : tone.accent)}
              {head(s.headline, undefined, { color: ink })}
              {body(s.body, onPhoto ? "rgba(255,255,255,0.92)" : tone.muted, 38, { marginTop: 28 })}
            </div>
          </div>
        </div>
      );
    }

    case "photo":
      return (
        <div style={frame}>
          {fullImage(s.image)}
          {s.headline ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: SLIDE_W,
                display: "flex",
                flexDirection: "column",
                padding: `40px ${PAD}px`,
                background: tone.bg,
                color: tone.ink,
              }}
            >
              {head(s.headline, 44)}
            </div>
          ) : null}
        </div>
      );

    case "product":
      return (
        <div style={{ ...frame, padding: PAD }}>
          {footer(tone.muted)}
          {/* Product shots are on white, so they sit on a white card on purpose. */}
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              margin: "36px 0 48px",
              borderRadius: 36,
              background: "#FFFFFF",
              padding: 36,
            }}
          >
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" width={760} height={600} style={{ width: 760, height: 600, objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", fontFamily: t.bodyFont, fontSize: 28, color: "#9CA3AF" }}>Add a product photo</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {kicker(tone.accent)}
            {head(s.headline, Math.min(72, headSize(s.headline, t.headUpper)))}
            {body(s.body, tone.muted, 36, { marginTop: 18 })}
            {s.meta ? (
              <div style={{ display: "flex", marginTop: 22, fontFamily: t.bodyFont, fontWeight: 700, fontSize: 38, color: tone.accent }}>
                {s.meta}
              </div>
            ) : null}
          </div>
        </div>
      );

    case "list":
      return (
        <div style={{ ...frame, padding: PAD, justifyContent: "space-between" }}>
          {footer(tone.muted)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {kicker(tone.accent)}
            {head(s.headline, Math.min(80, headSize(s.headline, t.headUpper)))}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
              {s.items.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", marginTop: i ? 30 : 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      background: tone.accent,
                      color: tone.onAccent,
                      fontFamily: t.bodyFont,
                      fontWeight: 700,
                      fontSize: 28,
                      marginRight: 30,
                      flexShrink: 0,
                    }}
                  >
                    {String(i + 1)}
                  </div>
                  {body(item, tone.ink, 38, { flex: 1, paddingTop: 4 })}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex" }} />
        </div>
      );

    case "quote":
      return (
        <div style={{ ...frame, padding: PAD, justifyContent: "space-between" }}>
          {footer(tone.muted)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: t.headFont, fontWeight: t.headWeight, fontSize: 220, lineHeight: 0.8, color: tone.accent }}>
              “
            </div>
            {head(s.headline, Math.min(76, headSize(s.headline, t.headUpper)), {
              fontStyle: t.headItalicQuote ? "italic" : "normal",
              marginTop: 8,
            })}
            {s.meta ? body(`— ${s.meta}`, tone.muted, 32, { marginTop: 36, letterSpacing: 1 }) : null}
          </div>
          <div style={{ display: "flex" }} />
        </div>
      );

    case "cta":
      return (
        <div style={{ ...frame, padding: PAD, justifyContent: "space-between" }}>
          {footer(tone.muted)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            {kicker(tone.accent)}
            {head(s.headline, undefined, { textAlign: "center", justifyContent: "center" })}
            {body(s.body, tone.muted, 40, { marginTop: 30, textAlign: "center", justifyContent: "center" })}
            {s.meta ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 56,
                  padding: "24px 52px",
                  borderRadius: 999,
                  background: tone.accent,
                  color: tone.onAccent,
                  fontFamily: t.bodyFont,
                  fontWeight: 600,
                  fontSize: 32,
                  letterSpacing: 1,
                }}
              >
                {s.meta}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex" }} />
        </div>
      );

    case "text":
    default:
      return (
        <div style={{ ...frame, padding: PAD, justifyContent: "space-between" }}>
          {footer(tone.muted)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {kicker(tone.accent)}
            {head(s.headline)}
            <div style={{ display: "flex", width: 96, height: 4, background: tone.accent, margin: "44px 0" }} />
            {body(s.body, tone.muted, 40)}
          </div>
          <div style={{ display: "flex" }} />
        </div>
      );
  }
}
