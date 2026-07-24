"use client";

import { useEffect, useState } from "react";

/** Matches Tailwind's `md` breakpoint — below this, the `md:` variants are off. */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * Whether the viewport is phone-sized.
 *
 * Only reach for this when a difference can't be expressed in CSS — hiding a
 * control is a `md:hidden` job, but *changing behaviour* (forcing a value,
 * swapping what a button does) needs the real answer in JS.
 *
 * Starts `false` on the server and on first paint, then corrects after mount.
 * That order matters: it keeps SSR markup and the first client render
 * identical, so React never hydration-mismatches.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return isMobile;
}
