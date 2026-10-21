"use client";

import { useId } from "react";
import { AlertTriangle, Loader2, Plug } from "lucide-react";
import clsx from "clsx";
import type { BrandConnection, MetaConnectionStatus, SocialBrand, SocialPlatform } from "@/lib/social/types";

/**
 * "Where do our posts go?" — one card per connected social account (the
 * brand's Facebook Page and Instagram): avatar with the platform logo,
 * handle and follower count, all one height. Accounts that aren't hooked up
 * yet are a single quiet line; broken connections say why.
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
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" />
        Checking connected accounts…
      </div>
    );
  }
  if (!conn) return null;

  if (!conn.configured) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Meta isn&apos;t connected, so nothing will post. Set META_ACCESS_TOKEN in Vercel (docs/integrations.md, Meta section).
      </div>
    );
  }

  const noneSetUp = conn.brands.every((b) => !b.configured);
  const accounts = conn.brands.filter((b) => brand === "all" || b.brand === brand).flatMap(accountsFor);
  // Live and broken accounts get a card; not-yet-connected ones are one quiet line.
  const cards = accounts.filter((a) => a.state !== "off").sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const off = accounts.filter((a) => a.state === "off");
  const live = cards.filter((a) => a.state === "connected").length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Connected accounts</h2>
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{live}</span> of {accounts.length} ready to post
        </span>
      </div>

      {noneSetUp ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
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
        <>
          {cards.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((a) => (
                <AccountCard key={a.key} a={a} />
              ))}
            </div>
          )}
          {off.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Plug size={11} /> Not connected yet:
              </span>
              {off.map((a) => (
                <span key={a.key} className="inline-flex items-center gap-1">
                  <PlatformLogo platform={a.platform} size={12} muted />
                  {BRAND_NAME[a.brand]} {a.platform === "instagram" ? "Instagram" : "Facebook"}
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const ORDER: Record<Account["state"], number> = { connected: 0, broken: 1, off: 2 };

/** One account: platform mark, who it is, how big, and whether it can post. Same height every time. */
function AccountCard({ a }: { a: Account }) {
  const label = a.platform === "instagram" ? "Instagram" : "Facebook";
  const ok = a.state === "connected";
  const body = (
    <>
      <div className="relative shrink-0">
        <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200">
          {a.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatars, short-lived signed URLs
            <img src={a.pictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className={clsx(
                "flex h-full w-full items-center justify-center text-xs font-bold",
                a.brand === "NI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600",
              )}
            >
              {a.brand === "NI" ? "NI" : "S"}
            </div>
          )}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-px">
          <PlatformLogo platform={a.platform} size={15} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{a.name}</div>
        <div className="truncate text-xs text-gray-500">{ok ? (a.handle ?? label) : label}</div>
      </div>

      <div className="shrink-0 text-right">
        {ok ? (
          <>
            <div className="text-sm font-semibold tabular-nums text-gray-900">
              {a.followers != null ? formatCount(a.followers) : "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">followers</div>
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
            title={a.note ?? undefined}
          >
            <AlertTriangle size={11} /> Can&apos;t post
          </span>
        )}
      </div>
    </>
  );

  const cls = clsx(
    "flex h-[68px] items-center gap-3 rounded-xl border bg-white px-3.5 shadow-sm transition",
    ok ? "border-gray-200 hover:border-gray-300 hover:shadow" : "border-amber-200 bg-amber-50/50",
  );

  return ok && a.url ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className={cls} title={`Open ${a.handle ?? a.name} on ${label}`}>
      {body}
    </a>
  ) : (
    <div className={cls} title={a.note ? `${label} can't post: ${a.note}` : undefined}>
      {body}
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

