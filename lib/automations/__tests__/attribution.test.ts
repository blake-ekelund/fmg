import { describe, it, expect } from "vitest";
import { attributeOrders } from "../attribution";

const send = (customerKey: string, stepOrder: number, sentAt: string) => ({ customerKey, stepOrder, sentAt });
const order = (customerKey: string, date: string, total: number) => ({ customerKey, date, total });

describe("attributeOrders", () => {
  it("credits the most recent email before the order", () => {
    const out = attributeOrders(
      [send("d2c:a", 1, "2026-09-01T15:00:00Z"), send("d2c:a", 2, "2026-09-05T15:00:00Z")],
      [order("d2c:a", "2026-09-07", 40)],
      7,
    );
    expect(out.get(2)).toEqual({ orders: 1, revenue: 40 });
    expect(out.has(1)).toBe(false);
  });

  it("counts a same-day order and stops at the window edge", () => {
    const out = attributeOrders(
      [send("d2c:a", 1, "2026-09-01T20:00:00Z")],
      [order("d2c:a", "2026-09-01", 10), order("d2c:a", "2026-09-08", 20), order("d2c:a", "2026-09-09", 30)],
      7,
    );
    expect(out.get(1)).toEqual({ orders: 2, revenue: 30 });
  });

  it("never credits an order placed before the email or by someone else", () => {
    const out = attributeOrders(
      [send("d2c:a", 1, "2026-09-05T15:00:00Z")],
      [order("d2c:a", "2026-09-04", 50), order("d2c:b", "2026-09-06", 60)],
      7,
    );
    expect(out.size).toBe(0);
  });
});
