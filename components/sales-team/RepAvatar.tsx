import clsx from "clsx";
import { agencyTint, initials } from "./repShared";
import type { SalesRep } from "./reps";

/** Initials chip, tinted by agency so rows group visually. */
export default function RepAvatar({
  rep,
  size = 24,
  className,
}: {
  rep: SalesRep;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight",
        agencyTint(rep),
        className
      )}
    >
      {initials(rep.name)}
    </span>
  );
}
