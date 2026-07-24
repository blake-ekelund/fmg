import type { SVGProps } from "react";

/**
 * Channel glyphs.
 *
 * Hand-drawn rather than pulled from lucide because the channels are FMG's own
 * segmentation — there is no "nat/grocery" or "social seller" in a generic icon
 * set, and approximating them with the nearest stock icon reads as wrong at a
 * glance. Drawn on lucide's grid (24×24, stroke, round caps) so they sit
 * alongside the rest of the app's iconography without looking imported.
 *
 * Channel strings come from Fishbowl and are matched case-insensitively with
 * punctuation stripped, so "SALON/SPA", "Salon & Spa" and "salon spa" all land
 * on the same glyph. Anything unrecognised falls back to a neutral storefront.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
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

/* ── Per-channel glyphs ──────────────────────────────────────────────────── */

/** Gift — wrapped box with a ribbon. */
export const GiftIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="12" rx="1.5" />
    <path d="M3 13h18M12 9v12" />
    <path d="M12 9C10.5 9 7.5 8.6 7.5 6.2A2.2 2.2 0 0 1 12 5.6" />
    <path d="M12 9c1.5 0 4.5-.4 4.5-2.8A2.2 2.2 0 0 0 12 5.6" />
  </Svg>
);

/** Salon / spa — lotus bloom. */
export const SpaIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20c-3.6 0-7-2.4-8.2-5.6 1.5-.8 3.2-1 4.8-.5" />
    <path d="M12 20c3.6 0 7-2.4 8.2-5.6-1.5-.8-3.2-1-4.8-.5" />
    <path d="M12 20c2.4-1.8 3.8-4.6 3.8-7.6 0-3-1.4-5.8-3.8-7.6-2.4 1.8-3.8 4.6-3.8 7.6 0 3 1.4 5.8 3.8 7.6Z" />
  </Svg>
);

/** Pharmacy — mortar and pestle. */
export const PharmacyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h16" />
    <path d="M5.5 10c0 4 2.9 7 6.5 7s6.5-3 6.5-7" />
    <path d="M12 17v3M9 20h6" />
    <path d="M14.5 8 19 3.5" />
  </Svg>
);

/** Natural / grocery — basket with a leaf. */
export const GroceryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9h18l-1.6 9.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8Z" />
    <path d="M12 9c0-3 2-5 5-5-.3 3-2.2 5-5 5Z" />
    <path d="M9.5 13v3M14.5 13v3" />
  </Svg>
);

/** Hospital — building with a cross. */
export const HospitalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v15" />
    <path d="M3 21h18" />
    <path d="M12 8v5M9.5 10.5h5" />
    <path d="M10 21v-3.5h4V21" />
  </Svg>
);

/** Distributor — delivery truck. */
export const DistributorIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 7.5A1.5 1.5 0 0 1 3.5 6h9A1.5 1.5 0 0 1 14 7.5V16H2Z" />
    <path d="M14 10h3.6a2 2 0 0 1 1.7 1l1.7 2.8V16h-7Z" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Svg>
);

/** Hardware — wrench. */
export const HardwareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.6 4.4a4.5 4.5 0 0 0-5.9 5.6l-5.4 5.4a1.6 1.6 0 0 0 0 2.3l1.9 1.9a1.6 1.6 0 0 0 2.3 0l5.4-5.4a4.5 4.5 0 0 0 5.6-5.9l-2.6 2.6-2.4-.6-.6-2.4Z" />
  </Svg>
);

/** Web — globe. */
export const WebIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z" />
  </Svg>
);

/** Flower — bloom with a stem. */
export const FlowerIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="2.2" />
    <path d="M12 6.3c0-1.8-.9-2.8-2.2-2.8S7.6 4.5 7.6 6.3c0 .9.5 1.6 1.3 2" />
    <path d="M12 6.3c0-1.8.9-2.8 2.2-2.8s2.2 1 2.2 2.8c0 .9-.5 1.6-1.3 2" />
    <path d="M10.2 9.9c-1.5.9-2.8.7-3.4-.4-.6-1.1 0-2.4 1.6-3.3" />
    <path d="M13.8 9.9c1.5.9 2.8.7 3.4-.4.6-1.1 0-2.4-1.6-3.3" />
    <path d="M12 10.7V21" />
    <path d="M12 15c-2 0-3.4-1.2-3.8-3 2 0 3.4.9 3.8 3Z" />
  </Svg>
);

/** Casino — dice. */
export const CasinoIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3" />
    <circle cx="7" cy="7" r=".9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
    <circle cx="17" cy="17" r=".9" fill="currentColor" stroke="none" />
  </Svg>
);

/** Social seller — phone with a heart. */
export const SocialIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M10.5 19.5h3" />
    <path d="M12 13.6c-2.6-1.7-3.4-2.9-3.4-4.1a1.9 1.9 0 0 1 3.4-1.1 1.9 1.9 0 0 1 3.4 1.1c0 1.2-.8 2.4-3.4 4.1Z" />
  </Svg>
);

/** Fallback — generic storefront. */
export const StorefrontIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V10" />
    <path d="M3 10 4.7 4.6A1 1 0 0 1 5.7 4h12.6a1 1 0 0 1 1 .6L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    <path d="M9.5 21v-5h5v5" />
  </Svg>
);

/* ── Lookup ─────────────────────────────────────────────────────────────── */

/* Render functions, not components: they hold no state and take no hooks, and
   invoking them directly keeps React from treating each lookup as a freshly
   declared component type. */
type Glyph = (p: IconProps) => React.JSX.Element;

/** Keys are normalised: uppercase, non-alphanumerics collapsed to one space. */
const BY_CHANNEL: Record<string, Glyph> = {
  GIFT: GiftIcon,
  "SALON SPA": SpaIcon,
  SALON: SpaIcon,
  SPA: SpaIcon,
  PHARMACY: PharmacyIcon,
  "NAT GROCERY": GroceryIcon,
  GROCERY: GroceryIcon,
  NATURAL: GroceryIcon,
  HOSPITAL: HospitalIcon,
  DISTRIBUTOR: DistributorIcon,
  HARDWARE: HardwareIcon,
  WEB: WebIcon,
  FLOWER: FlowerIcon,
  CASINOS: CasinoIcon,
  CASINO: CasinoIcon,
  "SOCIAL SELLER": SocialIcon,
  SOCIAL: SocialIcon,
};

function normalize(channel: string): string {
  return channel
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function channelGlyph(channel: string | null | undefined): Glyph {
  if (!channel) return StorefrontIcon;
  return BY_CHANNEL[normalize(channel)] ?? StorefrontIcon;
}

/**
 * The icon for a channel, in a tinted square. `label` is carried as a title so
 * the glyph is not the only way to read the channel.
 */
export default function ChannelIcon({
  channel,
  size = 16,
  className,
}: {
  channel: string | null | undefined;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={channel ?? "Unclassified"}
      className={className}
      style={{ display: "inline-flex" }}
    >
      {channelGlyph(channel)({ size })}
    </span>
  );
}
