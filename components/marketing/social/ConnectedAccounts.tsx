"use client";

import { useId } from "react";
import { AlertTriangle, Loader2, Plug } from "lucide-react";
import clsx from "clsx";
import type { BrandConnection, MetaConnectionStatus, SocialBrand, SocialPlatform } from "@/lib/social/types";

/**
 * "Where do our posts go?" — one card per connected social account (the
 * brand's Facebook Page and Instagram), with the real platform logo and a
 * platform-coloured verified-style check. Brands that aren't hooked up yet
 * show as a quiet "Not connected" card; broken connections say why.
 */

const BRAND_NAME: Record<SocialBrand, string> = { NI: "Natural Inspirations", Sassy: "Sassy" };
const FB_BLUE = "#0866FF";

type Account = {
  key: string;
  brand: SocialBrand;
  platform: SocialPlatform;
  state: "connected" | "broken" | "off";
  name: string;
  handle: string | null;
  pictureUrl: string | null;
  followers: number | null;
  url: string | null;
  note: string | null;
};

function accountsFor(b: BrandConnection): Account[] {
  const base = { brand: b.brand, followers: null, pictureUrl: null, url: null, handle: null };
  if (!b.configured) {
    return (["instagram", "facebook"] as const).map((platform) => ({
      ...base,
      key: `${b.brand}-${platform}`,
      platform,
      state: "off",
      name: BRAND_NAME[b.brand],
      note: "Not connected yet",
    }));
  }
  const ig: Account = b.instagram
    ? {
        ...base,
        key: `${b.brand}-instagram`,
        platform: "instagram",
        state: "connected",
        name: BRAND_NAME[b.brand],
        handle: b.instagram.username ? `@${b.instagram.username}` : null,
        pictureUrl: b.instagram.pictureUrl ?? null,
        followers: b.instagram.followers ?? null,
        url: b.instagram.username ? `https://www.instagram.com/${b.instagram.username}/` : null,
        note: null,
      }
    : { ...base, key: `${b.brand}-instagram`, platform: "instagram", state: "broken", name: BRAND_NAME[b.brand], note: b.error };
  const fb: Account = b.facebook
    ? {
        ...base,
        key: `${b.brand}-facebook`,
        platform: "facebook",
        state: "connected",
        name: b.facebook.name,
        handle: "Facebook Page",
        pictureUrl: b.facebook.pictureUrl ?? null,
        followers: b.facebook.followers ?? null,
        url: b.facebook.link ?? `https://www.facebook.com/${b.facebook.id}`,
        note: null,
      }
    : { ...base, key: `${b.brand}-facebook`, platform: "facebook", state: "broken", name: BRAND_NAME[b.brand], note: b.error };
  return [ig, fb];
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

export default function ConnectedAccounts({
  conn,
  loading,
  brand,
}: {
  conn: MetaConnectionStatus | null;
  loading: boolean;
  brand: SocialBrand | "all";
}) {
  if (loading) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" />
        Checking connected accounts…
      </section>
    );
  }
  if (!conn) return null;

  if (!conn.configured) {
    return (
      <section className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Meta isn&apos;t connected, so nothing will post. Set META_ACCESS_TOKEN in Vercel (docs/integrations.md, Meta section).
      </section>
    );
  }

  const noneSetUp = conn.brands.every((b) => !b.configured);
  const accounts = conn.brands
    .filter((b) => brand === "all" || b.brand === brand)
    .flatMap(accountsFor)
    // Live accounts first, then problems, then the not-yet-connected placeholders.
    .sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const live = accounts.filter((a) => a.state === "connected").length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Connected accounts</h2>
        <span className="text-xs text-gray-500">
          {live} {live === 1 ? "account" : "accounts"} ready to post
        </span>
      </div>

      {noneSetUp ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Meta is connected but no brand has a Page yet. Set META_PAGE_ID_NI / META_PAGE_ID_SASSY in Vercel:
          <ul className="mt-1 font-mono text-xs">
            {(conn.visiblePages ?? []).map((p) => (
              <li key={p.id}>
                {p.id} — {p.name}
                {p.instagram ? ` (IG @${p.instagram})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {accounts.map((a) => (
            <AccountCard key={a.key} a={a} />
          ))}
        </div>
      )}
    </section>
  );
}

const ORDER: Record<Account["state"], number> = { connected: 0, broken: 1, off: 2 };

function AccountCard({ a }: { a: Account }) {
  const label = a.platform === "instagram" ? "Instagram" : "Facebook";
  const body = (
    <>
      <div className="relative shrink-0">
        <Avatar a={a} />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-white p-[2px] shadow-sm">
          <PlatformLogo platform={a.platform} size={16} muted={a.state === "off"} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className={clsx("truncate text-sm font-semibold", a.state === "off" ? "text-gray-500" : "text-gray-900")}>
            {a.name}
          </span>
          {a.state === "connected" && <VerifiedCheck platform={a.platform} />}
        </div>
        {a.state === "connected" ? (
          <div className="truncate text-xs text-gray-500">
            {a.handle ?? label}
            {a.followers != null && <> · {formatCount(a.followers)} followers</>}
          </div>
        ) : a.state === "broken" ? (
          <div className="flex items-start gap-1 text-xs text-amber-700" title={a.note ?? undefined}>
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{label} can&apos;t post: {a.note}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Plug size={11} />
            {label} · {a.note}
          </div>
        )}
      </div>
    </>
  );

  const cls = clsx(
    "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition",
    a.state === "connected" && "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm",
    a.state === "broken" && "border-amber-200 bg-amber-50/60",
    a.state === "off" && "border-dashed border-gray-200 bg-gray-50/60",
  );

  return a.state === "connected" && a.url ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className={cls} title={`Open on ${label}`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Avatar({ a }: { a: Account }) {
  const ring =
    a.state !== "connected"
      ? "ring-1 ring-gray-200"
      : a.platform === "instagram"
        ? "p-[2px] bg-[conic-gradient(from_200deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5,#FEDA75)]"
        : "ring-2 ring-[#0866FF]/20";
  return (
    <div className={clsx("h-11 w-11 rounded-full", ring)}>
      <div className="h-full w-full overflow-hidden rounded-full border-2 border-white bg-gray-100">
        {a.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatars, short-lived signed URLs
          <img src={a.pictureUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className={clsx(
              "flex h-full w-full items-center justify-center text-xs font-bold",
              a.state === "off" ? "text-gray-400" : a.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600",
            )}
          >
            {a.brand === "NI" ? "NI" : "S"}
          </div>
        )}
      </div>
    </div>
  );
}

/** The official-style glyphs — lucide's brand icons are outline-only and deprecated. */
export function PlatformLogo({ platform, size = 16, muted = false }: { platform: SocialPlatform; size?: number; muted?: boolean }) {
  const gid = useId();
  if (platform === "facebook") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Facebook" role="img" className="block">
        <circle cx="12" cy="12" r="12" fill={muted ? "#9CA3AF" : FB_BLUE} />
        <path
          fill="#fff"
          d="M16.67 15.47 17.2 12h-3.33V9.75c0-.95.47-1.88 1.95-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.04V24a12.1 12.1 0 0 0 3.75 0v-8.53h2.8Z"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Instagram" role="img" className="block">
      <defs>
        <radialGradient id={gid} cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#FDF497" />
          <stop offset=".05" stopColor="#FDF497" />
          <stop offset=".45" stopColor="#FD5949" />
          <stop offset=".6" stopColor="#D6249F" />
          <stop offset=".9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={muted ? "#9CA3AF" : `url(#${gid})`} />
      <rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.4" cy="7.6" r="1.05" fill="#fff" />
    </svg>
  );
}

/** Verified-style scalloped badge in the platform's colour: "this account is live and ours". */
function VerifiedCheck({ platform }: { platform: SocialPlatform }) {
  const gid = useId();
  const fill = platform === "facebook" ? FB_BLUE : `url(#${gid})`;
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" className="shrink-0" role="img" aria-label="Connected">
      <title>{`Connected to ${platform === "facebook" ? "Facebook" : "Instagram"}`}</title>
      {platform === "instagram" && (
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#FA7E1E" />
            <stop offset=".5" stopColor="#D62976" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
      )}
      <path
        fill={fill}
        d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.7 1.8-1 3.1 1 3.1-2.7 1.8-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.7-1.8 1-3.1-1-3.1 2.7-1.8 1-3.1 3.2.2Z"
      />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="m7.8 12.2 2.8 2.8 5.6-5.8" />
    </svg>
  );
}
