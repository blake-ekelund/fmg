import type { SVGProps } from "react";

/**
 * The Rep Portal's own icon set.
 *
 * Hand-drawn rather than pulled from lucide so the portal carries FMG's
 * iconography end to end — the same reasoning behind the channel glyphs in
 * ./ChannelIcon, which share this exact grid (24×24, 1.6 stroke, round caps,
 * currentColor). Each export mirrors the name of the lucide icon it replaced,
 * so call sites only change the import path.
 *
 * Sized by the `size` prop (default 24, lucide parity) or by a width/height
 * className — a Tailwind `h-4 w-4` overrides the presentation attributes, same
 * as it did with lucide.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };
export type PortalIcon = (props: IconProps) => React.JSX.Element;

/** Shared frame. Exported so ./ChannelIcon draws on the identical grid. */
export function Svg({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Arrows ──────────────────────────────────────────────────────────────── */

export const ArrowUpRight: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </Svg>
);

export const ArrowDownRight: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M7 7 17 17" />
    <path d="M17 7v10H7" />
  </Svg>
);

export const ArrowLeft: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Svg>
);

export const ArrowRight: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);

/* ── Chevrons ────────────────────────────────────────────────────────────── */

export const ChevronDown: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronUp: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);

export const ChevronsUpDown: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </Svg>
);

export const ChevronLeft: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ChevronRight: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

/* ── People / money ──────────────────────────────────────────────────────── */

export const Users: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
    <circle cx="10" cy="8" r="3.5" />
    <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4" />
    <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8" />
  </Svg>
);

export const DollarSign: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M12 2v20" />
    <path d="M17 5.5H9.75a3.25 3.25 0 0 0 0 6.5h4.5a3.25 3.25 0 0 1 0 6.5H6" />
  </Svg>
);

export const TrendingUp: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);

export const TrendingDown: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </Svg>
);

/* ── UI controls ─────────────────────────────────────────────────────────── */

export const Menu: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Svg>
);

export const X: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);

export const Check: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const Search: PortalIcon = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const Loader2: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
  </Svg>
);

export const Download: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    <path d="m8 11 4 4 4-4" />
    <path d="M12 15V3" />
  </Svg>
);

export const Copy: PortalIcon = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

export const LogOut: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const Send: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4Z" />
  </Svg>
);

/* ── Communication / places ──────────────────────────────────────────────── */

export const Mail: PortalIcon = (p) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m3 6 9 6 9-6" />
  </Svg>
);

export const Phone: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M6.5 3h-2A1.5 1.5 0 0 0 3 4.6C3 13 11 21 19.4 21a1.5 1.5 0 0 0 1.6-1.5v-2a1.2 1.2 0 0 0-1-1.2l-3-.6a1.2 1.2 0 0 0-1.2.5l-.8 1.1a13 13 0 0 1-5.3-5.3l1.1-.8a1.2 1.2 0 0 0 .5-1.2l-.6-3a1.2 1.2 0 0 0-1.2-1Z" />
  </Svg>
);

export const Globe: PortalIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z" />
  </Svg>
);

export const MessageSquare: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
  </Svg>
);

export const MapPin: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M20 10.5c0 5.5-8 11.5-8 11.5s-8-6-8-11.5a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10.5" r="2.8" />
  </Svg>
);

/* ── Objects ─────────────────────────────────────────────────────────────── */

export const Package: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M20 8.5 12 4 4 8.5v7L12 20l8-4.5Z" />
    <path d="m4 8.5 8 4.5 8-4.5" />
    <path d="M12 13v7" />
    <path d="M8 6.25 16 10.75" />
  </Svg>
);

export const Boxes: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M11 8.5 7 6.3 3 8.5v4.2L7 15l4-2.3Z" />
    <path d="m3 8.5 4 2.2 4-2.2" />
    <path d="M7 10.7V15" />
    <path d="M21 8.5 17 6.3l-4 2.2v4.2L17 15l4-2.3Z" />
    <path d="m13 8.5 4 2.2 4-2.2" />
    <path d="M17 10.7V15" />
    <path d="M16 17.5 12 15.3 8 17.5v.1" />
  </Svg>
);

export const Tag: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M3 11.5V4.5A1.5 1.5 0 0 1 4.5 3h7a1.5 1.5 0 0 1 1.06.44l7.5 7.5a1.5 1.5 0 0 1 0 2.12l-7 7a1.5 1.5 0 0 1-2.12 0l-7.5-7.5A1.5 1.5 0 0 1 3 11.5Z" />
    <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const FileText: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  </Svg>
);

export const Megaphone: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="m3 11 15-6v14l-15-6Z" />
    <path d="M3 11H2.5A1.5 1.5 0 0 0 1 12.5v0A1.5 1.5 0 0 0 2.5 14H3Z" />
    <path d="M7 13v5a1.5 1.5 0 0 0 3 0v-4" />
  </Svg>
);

export const Truck: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M2 7.5A1.5 1.5 0 0 1 3.5 6h9A1.5 1.5 0 0 1 14 7.5V16H2Z" />
    <path d="M14 10h3.6a2 2 0 0 1 1.7 1l1.7 2.8V16h-7Z" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Svg>
);

export const ImageIcon: PortalIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.6" />
    <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L17 18" />
    <path d="m14 15 1.5-1.5a2 2 0 0 1 2.8 0L21 16" />
  </Svg>
);

/* ── Motif ───────────────────────────────────────────────────────────────── */

export const Sparkles: PortalIcon = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8Z" />
    <path d="M18.5 14.5 19 16l1.5.5L19 17l-.5 1.5L18 17l-1.5-.5L18 16Z" />
    <path d="M6 15.5 6.5 17l1.5.5L6.5 19 6 20.5 5.5 19 4 18.5 5.5 18Z" />
  </Svg>
);

export const Bot: PortalIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="9" width="16" height="11" rx="2.5" />
    <path d="M12 5v4" />
    <circle cx="12" cy="4" r="1.3" />
    <path d="M9 14v1.5" />
    <path d="M15 14v1.5" />
    <path d="M2 13v3" />
    <path d="M22 13v3" />
  </Svg>
);
