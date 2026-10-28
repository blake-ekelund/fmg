"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";

const DURATION_MS = 300;

/**
 * A right-hand drawer that slides in and out (the backdrop fades with it).
 *
 * It stays mounted through the exit so the slide-out can play: `open` going
 * false starts the animation, and the panel unmounts once it finishes. Esc and
 * a click on the backdrop call onClose. Honors prefers-reduced-motion.
 */
export default function SlideOver({
  open,
  onClose,
  children,
  widthClass = "max-w-[600px]",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  // Mount as soon as it's asked to open (during render, so there's no blank frame).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    // One frame after mounting, flip to the "in" position so the transition runs.
    if (open) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const id = requestAnimationFrame(() => setShown(false));
    const t = setTimeout(() => setMounted(false), DURATION_MS);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-hidden={!open}>
      <div
        onClick={onClose}
        className={clsx(
          "absolute inset-0 bg-black/20 transition-opacity duration-300 ease-out motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          "relative flex h-full w-full flex-col bg-white shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
          widthClass,
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {children}
      </div>
    </div>
  );
}
