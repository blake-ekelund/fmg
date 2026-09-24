"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, Compass, Home } from "lucide-react";
import { useUser } from "@/components/UserContext";
import { getDefaultRoute, getNavForRole, type NavItem } from "@/components/navConfig";

/** Small edit distance, for typo'd URL segments ("reveiws" → "reviews"). */
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

/** How well a nav page matches the path someone tried. */
function score(tried: string[], item: NavItem): number {
  const target = [...words(item.href), ...words(item.label)];
  let s = 0;
  for (const t of tried) {
    let best = 0;
    for (const u of target) {
      if (u === t) best = Math.max(best, 3);
      else if (t.length >= 3 && (u.startsWith(t) || t.startsWith(u)) && u.length >= 3)
        best = Math.max(best, 2);
      else if (Math.min(t.length, u.length) >= 4 && lev(t, u) <= 2) best = Math.max(best, 1.5);
    }
    s += best;
  }
  return s;
}

/**
 * The portal's 404, rendered inside the app shell. Instead of a dead end it
 * reads the URL that missed and suggests the closest pages this user can
 * actually open (typo-tolerant), plus a way home and back.
 */
export default function NotFoundPanel() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { profile } = useUser();
  const role = profile?.access ?? null;

  const suggestions = useMemo(() => {
    const tried = words(pathname);
    const items = getNavForRole(role).flatMap((s) => s.items);
    const ranked = items
      .map((item) => ({ item, s: score(tried, item) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.item);
    // Nothing close? Offer the first few pages of their nav instead.
    return ranked.length ? { close: true, items: ranked } : { close: false, items: items.slice(0, 4) };
  }, [pathname, role]);

  const home = getDefaultRoute(role);

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6 md:px-8">
      <div className="w-full max-w-xl">
        <div className="relative">
          <div
            aria-hidden
            className="select-none bg-gradient-to-br from-gray-900 via-gray-700 to-gray-400 bg-clip-text text-[7.5rem] font-black leading-none tracking-tighter text-transparent md:text-[9rem]"
          >
            404
          </div>
          <Compass
            aria-hidden
            size={44}
            className="absolute right-0 top-4 rotate-12 text-gray-200 md:right-8"
          />
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
          This page isn&apos;t in the system.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          We checked Fishbowl, QuickBooks, and behind the pallets in the
          warehouse. Nothing lives at{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-gray-700">
            {pathname || "/"}
          </code>
          .
        </p>

        {suggestions.items.length ? (
          <div className="mt-7">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              {suggestions.close ? "Did you mean…" : "Jump back in"}
            </div>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {suggestions.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 group-hover:bg-gray-900 group-hover:text-white">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">{item.label}</span>
                        <span className="block truncate font-mono text-[11px] text-gray-400">
                          {item.href}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2">
          <Link
            href={home}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Home size={14} /> Take me home
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={14} /> Go back
          </button>
        </div>
      </div>
    </div>
  );
}
