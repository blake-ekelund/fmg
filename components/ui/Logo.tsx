import clsx from "clsx";

/* ---------------------------------------------------------------
   FMG brand mark

   A navy tile carrying an "F" cut by a gold rule — the rule is the
   only place gold appears at small sizes, so the mark stays legible
   down to a 16px favicon. Keep the geometry in sync with
   app/icon.svg, which is the same drawing.
--------------------------------------------------------------- */

export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="var(--color-brand-700)" />
      <path
        d="M11 9.5h11M11 9.5v13M11 15.5h7.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 22.5h3"
        stroke="var(--color-accent-500)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LogoProps = {
  /** Hide the wordmark — used by the collapsed nav rail. */
  markOnly?: boolean;
  /** Render for a dark background (the nav rail). */
  inverse?: boolean;
  size?: number;
  className?: string;
};

export default function Logo({
  markOnly = false,
  inverse = false,
  size = 28,
  className,
}: LogoProps) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LogoMark
        size={size}
        className={inverse ? "ring-1 ring-white/15 rounded-[9px]" : undefined}
      />
      {!markOnly && (
        <span className="flex flex-col leading-none min-w-0">
          <span
            className={clsx(
              "text-[15px] font-semibold tracking-tight",
              inverse ? "text-white" : "text-ink"
            )}
          >
            FMG
          </span>
          <span
            className={clsx(
              "mt-1 text-[10px] font-medium uppercase tracking-[0.14em] truncate",
              inverse ? "text-white/45" : "text-ink-subtle"
            )}
          >
            Portal
          </span>
        </span>
      )}
    </span>
  );
}
