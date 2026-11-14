"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children at the end of <body>.
 *
 * Use it for modals opened from inside the top bar (or anything with
 * backdrop-filter / transform / filter): those properties make a `fixed`
 * descendant position against that element instead of the window, so a
 * full-screen dialog gets centred on the 56px header and pushed off-screen.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
