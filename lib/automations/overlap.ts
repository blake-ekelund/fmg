/**
 * Keeping one customer out of five flows at once.
 *
 * Two rules, both applied by the automations cron:
 *
 * 1. One journey at a time. Every automation is a "journey" (drips, win-backs,
 *    lifecycles — anything with a sequence) or a "one_off" (a dated send that
 *    may overlap). A customer is active in at most one journey. Priority
 *    decides who wins: 1 is the highest. A higher-priority journey takes the
 *    customer and PAUSES the lower one, which resumes where it left off once
 *    the customer is free again; a lower-priority journey simply waits. Ties
 *    go to the journey the customer is already in.
 *
 * 2. A shared frequency cap. However many flows a customer is in, they get at
 *    most `perWeek` marketing emails in any 7 days, at least `minGapDays`
 *    apart — counting automation sends and bulk blasts alike. A send over the
 *    cap is postponed to the first slot the cap allows, never dropped.
 *
 * Pure functions only; the cron does the reading and writing.
 */

export type FlowKind = "journey" | "one_off";

export const DEFAULT_PRIORITY = 5;
export const PRIORITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type SendingLimits = { perWeek: number; minGapDays: number };
export const DEFAULT_LIMITS: SendingLimits = { perWeek: 3, minGapDays: 2 };

const DAY = 86_400_000;

/** A dated send defaults to one-off; anything with a sequence is a journey. */
export function flowKind(triggerType: string, cfg: { flow_kind?: string } | null | undefined): FlowKind {
  if (cfg?.flow_kind === "journey" || cfg?.flow_kind === "one_off") return cfg.flow_kind;
  return triggerType === "date" ? "one_off" : "journey";
}

export function flowPriority(cfg: { priority?: unknown } | null | undefined): number {
  const p = Number(cfg?.priority);
  return Number.isInteger(p) && p >= 1 ? p : DEFAULT_PRIORITY;
}

export type ActiveJourney = { enrollmentId: string; automationId: string; priority: number };

/**
 * Should a customer enter this journey, given the other journeys they're
 * active in right now?
 *  - `enroll`: yes, and pause these lower-priority enrollments.
 *  - `hold`:   no, a journey of equal or higher priority has them.
 */
export function decideEnrollment(
  priority: number,
  activeElsewhere: ActiveJourney[],
): { action: "enroll"; pause: string[] } | { action: "hold"; heldBy: ActiveJourney } {
  const blocker = activeElsewhere
    .filter((a) => a.priority <= priority)
    .sort((x, y) => x.priority - y.priority)[0];
  if (blocker) return { action: "hold", heldBy: blocker };
  return { action: "enroll", pause: activeElsewhere.map((a) => a.enrollmentId) };
}

/**
 * May a paused journey resume? Only once no other journey of equal or higher
 * priority still has the customer.
 */
export function canResume(priority: number, activeElsewhere: ActiveJourney[]): boolean {
  return !activeElsewhere.some((a) => a.priority <= priority);
}

/**
 * Frequency cap check for one marketing send.
 * `recent` = when this address was last emailed (marketing only), any order.
 * Returns `retryAt` = the earliest moment both rules allow the send.
 */
export function capDecision(
  recent: Date[],
  now: Date,
  limits: SendingLimits,
): { ok: true } | { ok: false; retryAt: Date; reason: string } {
  const windowStart = now.getTime() - 7 * DAY;
  const inWindow = recent.map((d) => d.getTime()).filter((t) => t > windowStart).sort((a, b) => a - b);
  const latest = inWindow[inWindow.length - 1];

  let retry = 0;
  let reason = "";
  if (limits.perWeek > 0 && inWindow.length >= limits.perWeek) {
    // The (n - perWeek + 1)th oldest send has to age out of the 7-day window.
    retry = inWindow[inWindow.length - limits.perWeek] + 7 * DAY;
    reason = `${limits.perWeek} emails in 7 days`;
  }
  if (limits.minGapDays > 0 && latest !== undefined && latest > now.getTime() - limits.minGapDays * DAY) {
    const gapFree = latest + limits.minGapDays * DAY;
    if (gapFree > retry) {
      retry = gapFree;
      reason = `${limits.minGapDays} days between emails`;
    }
  }
  return retry > now.getTime() ? { ok: false, retryAt: new Date(retry), reason } : { ok: true };
}
