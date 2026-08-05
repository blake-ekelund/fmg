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

/**
 * Per-field annotation keyed by the Point B (order-info) field name — used by
 * the relationships inspector to label a real order's fields. Fields not listed
 * are shown as unmapped pass-through.
 */
export const FIELD_LOOKUP: Record<string, { fishbowl: string; owner: PushOwner; note?: string }> = {
  // Identity / routing (we send these)
  custid: { fishbowl: "1590", owner: "constant", note: "NI customer id" },
  order_type: { fishbowl: "O", owner: "constant", note: "Outbound" },
  order_type_desc: { fishbowl: "—", owner: "constant" },
  from_facility: { fishbowl: "PB1", owner: "constant" },
  po_number: { fishbowl: "so.num", owner: "connector-out" },
  reference: { fishbowl: "so.customerPO", owner: "connector-out" },
  ship_type: { fishbowl: "S", owner: "constant", note: "Small Pkg" },
  ship_type_desc: { fishbowl: "—", owner: "constant" },
  ship_terms: { fishbowl: "PPD", owner: "constant", note: "Prepaid" },
  ship_terms_desc: { fishbowl: "—", owner: "constant" },
  // Ship-to (we send these)
  ship_to_name: { fishbowl: "so.shipToName", owner: "connector-out" },
  ship_to_contact: { fishbowl: "so.shipToName", owner: "connector-out" },
  ship_to_address_1: { fishbowl: "so.shipToAddress", owner: "connector-out" },
  ship_to_address_2: { fishbowl: "so.shipToAddress (line 2)", owner: "connector-out" },
  ship_to_city: { fishbowl: "so.shipToCity", owner: "connector-out" },
  ship_to_state: { fishbowl: "so.shipToStateId → state", owner: "connector-out" },
  ship_to_postal_code: { fishbowl: "so.shipToZip", owner: "connector-out" },
  ship_to_country_code: { fishbowl: "so.shipToCountryId → country", owner: "connector-out" },
  ship_to_phone: { fishbowl: "so.phone", owner: "connector-out" },
  ship_to_email: { fishbowl: "so.email", owner: "connector-out" },
  // Shipment back (Point B sends these)
  order_status: { fishbowl: "→ ready-to-finalize signal", owner: "connector-in", note: "9 = Shipped" },
  order_status_desc: { fishbowl: "—", owner: "connector-in" },
  date_shipped: { fishbowl: "→ ship record", owner: "connector-in" },
  carrier: { fishbowl: "carrier (rate-shopped)", owner: "connector-in" },
  scac: { fishbowl: "carrier code", owner: "connector-in" },
  shipping_cost: { fishbowl: "freight → ×1.25 → Shipping line", owner: "connector-in" },
  qty_ship: { fishbowl: "soitem.qtyFulfilled (on ship)", owner: "connector-in" },
  weight_ship: { fishbowl: "—", owner: "connector-in" },
};

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
