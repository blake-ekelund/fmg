/**
 * Last-touch revenue attribution for an automation's emails.
 *
 * Each order counts toward the most recent email the automation sent that
 * customer, provided the order is dated no earlier than the send's day and no
 * more than `windowDays` after it. Orders carry only a date (Fishbowl's
 * datecompleted), so the comparison is by calendar day: an order on the same
 * day as the email counts.
 */

export type AttrSend = { customerKey: string; stepOrder: number; sentAt: string };
export type AttrOrder = { customerKey: string; date: string; total: number };

export function attributeOrders(
  sends: AttrSend[],
  orders: AttrOrder[],
  windowDays: number,
): Map<number, { orders: number; revenue: number }> {
  const day = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const byCustomer = new Map<string, AttrSend[]>();
  for (const s of sends) {
    const arr = byCustomer.get(s.customerKey) ?? [];
    arr.push(s);
    byCustomer.set(s.customerKey, arr);
  }

  const out = new Map<number, { orders: number; revenue: number }>();
  for (const o of orders) {
    const orderDay = day(o.date);
    let best: AttrSend | null = null;
    for (const s of byCustomer.get(o.customerKey) ?? []) {
      const age = (orderDay - day(s.sentAt)) / 86_400_000;
      if (age >= 0 && age <= windowDays && (!best || s.sentAt > best.sentAt)) best = s;
    }
    if (!best) continue;
    const agg = out.get(best.stepOrder) ?? { orders: 0, revenue: 0 };
    agg.orders++;
    agg.revenue += o.total;
    out.set(best.stepOrder, agg);
  }
  return out;
}
