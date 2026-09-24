import { describe, it, expect } from "vitest";
import { capDecision, canResume, decideEnrollment, flowKind, flowPriority, DEFAULT_PRIORITY } from "../overlap";

const DAY = 86_400_000;
const now = new Date("2026-09-24T15:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("flow kind and priority", () => {
  it("defaults dated sends to one-off and sequences to journeys", () => {
    expect(flowKind("date", {})).toBe("one_off");
    expect(flowKind("order_event", {})).toBe("journey");
    expect(flowKind("status_change", { flow_kind: "one_off" })).toBe("one_off");
  });

  it("falls back to the default priority for missing or junk values", () => {
    expect(flowPriority({ priority: 2 })).toBe(2);
    expect(flowPriority({})).toBe(DEFAULT_PRIORITY);
    expect(flowPriority({ priority: 0 })).toBe(DEFAULT_PRIORITY);
  });
});

describe("decideEnrollment", () => {
  it("enrolls when the customer is in no other journey", () => {
    expect(decideEnrollment(3, [])).toEqual({ action: "enroll", pause: [] });
  });

  it("takes the customer from a lower-priority journey and pauses it", () => {
    expect(decideEnrollment(1, [{ enrollmentId: "e1", automationId: "a", priority: 4 }])).toEqual({
      action: "enroll",
      pause: ["e1"],
    });
  });

  it("holds when an equal or higher-priority journey already has them", () => {
    const r = decideEnrollment(3, [
      { enrollmentId: "e1", automationId: "a", priority: 3 },
      { enrollmentId: "e2", automationId: "b", priority: 1 },
    ]);
    expect(r.action).toBe("hold");
    if (r.action === "hold") expect(r.heldBy.automationId).toBe("b");
  });
});

describe("canResume", () => {
  it("resumes only once nothing of equal or higher priority has the customer", () => {
    expect(canResume(4, [])).toBe(true);
    expect(canResume(4, [{ enrollmentId: "e", automationId: "a", priority: 6 }])).toBe(true);
    expect(canResume(4, [{ enrollmentId: "e", automationId: "a", priority: 4 }])).toBe(false);
  });
});

describe("capDecision", () => {
  const limits = { perWeek: 3, minGapDays: 2 };

  it("allows a send with room under the cap and past the gap", () => {
    expect(capDecision([ago(6), ago(3)], now, limits)).toEqual({ ok: true });
  });

  it("postpones until the oldest send ages out when the weekly cap is full", () => {
    const r = capDecision([ago(6), ago(4), ago(2.5)], now, limits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAt.getTime()).toBe(ago(6).getTime() + 7 * DAY);
  });

  it("postpones to honour the minimum gap", () => {
    const r = capDecision([ago(1)], now, limits);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAt.getTime()).toBe(ago(1).getTime() + 2 * DAY);
      expect(r.reason).toContain("2 days");
    }
  });

  it("ignores sends older than the 7-day window", () => {
    expect(capDecision([ago(8), ago(9), ago(10)], now, limits)).toEqual({ ok: true });
  });

  it("treats zero as 'no limit'", () => {
    expect(capDecision([ago(0.1), ago(0.2), ago(0.3), ago(0.4)], now, { perWeek: 0, minGapDays: 0 })).toEqual({ ok: true });
  });
});
