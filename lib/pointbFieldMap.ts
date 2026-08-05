/**
 * The Fishbowl ↔ Point B field contract — the authoritative map of what fields
 * flow between the two systems, how they correspond, and WHO owns the push.
 * Reviewed daily (see the Field Map card on /pointb-check) to catch Point B
 * changing the shape of the relationship before it breaks an order or invoice.
 *
 * Client-safe: pure data, no secrets, no server imports.
 */

/** Which system initiates the write for a field. */
export type PushOwner =
  | "connector-out" // our connector: Fishbowl → Point B (create-order)
  | "connector-in" // our connector: Point B → Fishbowl (shipment write-back)
  | "human" // a person, natively in Fishbowl (the Ship click)
  | "constant"; // a fixed value we send, not sourced from a record

export type FieldMapEntry = {
  pointb: string; // the Point B / Synapse field
  fishbowl: string; // the corresponding Fishbowl field (or constant/derivation)
  owner: PushOwner;
  note?: string;
};

export type FieldMapGroup = { title: string; direction: "out" | "in"; entries: FieldMapEntry[] };

export const FIELD_MAP: FieldMapGroup[] = [
  {
    title: "Order out — Fishbowl → Point B (create-order)",
    direction: "out",
    entries: [
      { pointb: "custid", fishbowl: "1590", owner: "constant", note: "NI customer id" },
      { pointb: "order_type", fishbowl: "O (Outbound)", owner: "constant" },
      { pointb: "from_facility", fishbowl: "PB1", owner: "constant" },
      { pointb: "po_number", fishbowl: "so.num", owner: "connector-out", note: "Fishbowl SO # rides as the PO" },
      { pointb: "reference", fishbowl: "so.customerPO", owner: "connector-out", note: "customer/marketplace PO" },
      { pointb: "ship_type", fishbowl: "S (Small Pkg)", owner: "constant" },
      { pointb: "ship_terms", fishbowl: "PPD (Prepaid)", owner: "constant" },
      { pointb: "ship_to_name / address_1 / address_2 / city / state / postal_code / country_code / phone / email", fishbowl: "so.shipTo* block", owner: "connector-out" },
      { pointb: "details[].item", fishbowl: "soitem.productNum (part #)", owner: "connector-out" },
      { pointb: "details[].uom_entered", fishbowl: "soitem UOM (ea → EA)", owner: "connector-out" },
      { pointb: "details[].qty_entered", fishbowl: "soitem.qtyOrdered", owner: "connector-out" },
      { pointb: "carrier", fishbowl: "(omitted — Point B rate-shops)", owner: "constant" },
    ],
  },
  {
    title: "Shipment back — Point B → Fishbowl",
    direction: "in",
    entries: [
      { pointb: "plate_details[].tracking_number", fishbowl: "shipcarton.trackingNum  (+ Supabase for the customer email)", owner: "connector-in", note: "from shipped-orders, not order-info" },
      { pointb: "order/fees.totalAmount × 1.25", fishbowl: "soitem Shipping line ($)", owner: "connector-in", note: "freight + pick/pack, 25% markup (wholesale only)" },
      { pointb: "order/fees FRCHARGES", fishbowl: "(freight component of the line)", owner: "connector-in" },
      { pointb: "order/fees PICK-EACH / PICK-CASE / BaseOrderCharge", fishbowl: "(handling components of the line)", owner: "connector-in" },
      { pointb: "order_status = 9 (Shipped) / date_shipped", fishbowl: "signals it's ready to finalize", owner: "connector-in" },
      { pointb: "(the ship itself)", fishbowl: "so → Fulfilled, inventory relieved, invoice → QuickBooks", owner: "human", note: "a person clicks Ship in Fishbowl" },
    ],
  },
];

export const PUSH_LABEL: Record<PushOwner, string> = {
  "connector-out": "Connector → Point B",
  "connector-in": "Point B → Connector",
  human: "Human (in Fishbowl)",
  constant: "Fixed value",
};

/**
 * The Point B `order/fees` charge codes we know about. If a live order returns a
 * code NOT in this set, Point B added a new fee type — which changes the freight
 * math — and the drift check flags it. Codes/descriptions verified 2026-08-05.
 */
export const KNOWN_FEE_CODES: Record<number, string> = {
  1019: "FRCHARGES",
  1014: "PICK - EACH",
  1006: "PICK - CASE",
  1011: "BaseOrderCharge",
};
