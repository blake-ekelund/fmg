/**
 * Single source of truth for email merge fields.
 *
 * This module is intentionally dependency-free and isomorphic so it can be
 * imported by both the server send pipeline (lib/email/send.ts, which builds
 * the substitution regex from MERGE_KEYS) and the browser template editors
 * (the click-to-insert pickers and sample previews).
 *
 * Previously the token list was hand-copied into three editor components and
 * kept in sync with send.ts by a comment. To add a field now: add one row to
 * MERGE_FIELDS below, then add the matching `case` (with any formatting) to
 * applyMergeFields() in send.ts and a value to MergeVars there. Everything the
 * UI shows — pickers, previews, help text — derives from this list.
 */

export type MergeGroup = "Customer" | "Sender" | "Date" | "System";

/**
 * Who an email is destined for. Wholesale contacts are businesses — the name is
 * a company, so there's no personal first/last to split. D2C contacts are
 * individuals — they have a first and last name but no company. Fields declare
 * which audiences they apply to so the picker only shows what will populate.
 */
export type Audience = "wholesale" | "d2c";

export type MergeFieldDef = {
  /** Token name — used as {{key}}. camelCase, case-sensitive. */
  key: string;
  /** Plain-English label shown in the insert-token pickers. */
  label: string;
  /** Which section the field belongs to. */
  group: MergeGroup;
  /** Illustrative value used in editor previews only (never sent). */
  sample: string;
  /**
   * Whether the field appears in the click-to-insert picker. unsubscribeUrl is
   * populated only on bulk/list sends and is auto-appended by the send route,
   * so reps don't place it by hand — it's supported for substitution but hidden
   * from the picker.
   */
  pickable: boolean;
  /** Audiences this field populates for. Fields outside Customer apply to all. */
  audiences: readonly Audience[];
  /** Optional audience-specific label override (e.g. Company vs Full name). */
  labelByAudience?: Partial<Record<Audience, string>>;
};

const ALL: readonly Audience[] = ["wholesale", "d2c"];

// Sample-only date/quarter helpers. These feed editor previews, not real sends.
const NOW = new Date();
const sampleDate = (d: Date): string =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const sampleQuarter = (d: Date): string => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;

export const MERGE_FIELDS = [
  // Customer — read per recipient from customer_contact_summary / d2c_customer_contact.
  // firstName/lastName only populate for D2C individuals; wholesale uses the
  // whole company name via customerName.
  { key: "firstName", label: "First name", group: "Customer", sample: "Alex", pickable: true, audiences: ["d2c"] },
  { key: "lastName", label: "Last name", group: "Customer", sample: "Rivera", pickable: true, audiences: ["d2c"] },
  { key: "customerName", label: "Customer name", group: "Customer", sample: "Sprout Health Foods", pickable: true, audiences: ALL, labelByAudience: { wholesale: "Company name", d2c: "Full name" } },
  { key: "city", label: "City", group: "Customer", sample: "Bend", pickable: true, audiences: ALL },
  { key: "state", label: "State", group: "Customer", sample: "OR", pickable: true, audiences: ALL },
  { key: "channel", label: "Channel", group: "Customer", sample: "Wholesale", pickable: true, audiences: ALL },
  { key: "lifetimeRevenue", label: "Lifetime revenue", group: "Customer", sample: "$12,480", pickable: true, audiences: ALL },
  { key: "lifetimeOrders", label: "Lifetime orders", group: "Customer", sample: "37", pickable: true, audiences: ALL },
  { key: "lastOrderDate", label: "Last order date", group: "Customer", sample: sampleDate(NOW), pickable: true, audiences: ALL },
  { key: "daysSinceLastOrder", label: "Days since order", group: "Customer", sample: "56", pickable: true, audiences: ALL },
  // Sender — read once from the connected Outlook mailbox
  { key: "senderName", label: "Your name", group: "Sender", sample: "Your Name", pickable: true, audiences: ALL },
  { key: "senderFirstName", label: "Your first name", group: "Sender", sample: "Your", pickable: true, audiences: ALL },
  { key: "senderEmail", label: "Your email", group: "Sender", sample: "you@fragrance-marketing-group.com", pickable: true, audiences: ALL },
  // Date — derived from the server clock at send time
  { key: "currentYear", label: "Year", group: "Date", sample: String(NOW.getFullYear()), pickable: true, audiences: ALL },
  { key: "currentQuarter", label: "Quarter", group: "Date", sample: sampleQuarter(NOW), pickable: true, audiences: ALL },
  // System — auto-managed, not placed by hand
  { key: "unsubscribeUrl", label: "Unsubscribe link", group: "System", sample: "https://…/unsubscribe", pickable: false, audiences: ALL },
] as const satisfies readonly MergeFieldDef[];

/** Union of every supported token key, e.g. "firstName" | "customerName" | … */
export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];

/** All supported token keys, in declaration order. Drives the substitution regex. */
export const MERGE_KEYS: readonly MergeKey[] = MERGE_FIELDS.map((f) => f.key);

/** { key: sampleValue } for every field — used by editor previews. */
export const SAMPLE_VARS: Record<string, string> = Object.fromEntries(
  MERGE_FIELDS.map((f) => [f.key, f.sample]),
);

export type MergePickerGroup = { group: MergeGroup; fields: { key: string; label: string }[] };

/**
 * Pickable fields, grouped for the click-to-insert UI, filtered to the audience
 * the email is destined for. Pass "wholesale" or "d2c" to show only the fields
 * that will actually populate for that recipient type — e.g. wholesale hides
 * first/last name and labels customerName "Company name", while D2C shows first
 * and last name and labels customerName "Full name". "both" shows the union.
 *
 * Groups appear in a fixed order; any group left with no fields is omitted.
 */
export function mergeGroupsFor(channel: Audience | "both"): MergePickerGroup[] {
  const order: MergeGroup[] = ["Customer", "Sender", "Date", "System"];
  const want: readonly Audience[] = channel === "both" ? ALL : [channel];
  return order
    .map((group) => ({
      group,
      fields: MERGE_FIELDS.filter(
        (f) => f.pickable && f.group === group && f.audiences.some((a) => want.includes(a)),
      ).map((f: MergeFieldDef) => ({
        key: f.key,
        label: (channel !== "both" && f.labelByAudience?.[channel]) || f.label,
      })),
    }))
    .filter((g) => g.fields.length > 0);
}

/** All pickable fields (union across audiences). */
export const MERGE_GROUPS: MergePickerGroup[] = mergeGroupsFor("both");

/**
 * Split a contact's name into first/last for merge fields, honouring the
 * audience: wholesale contacts are companies (no personal name to split, so
 * both are empty — use {{customerName}} for the whole name); D2C contacts are
 * people, so the first word is the first name and the remainder the last.
 */
export function splitContactName(
  name: string | null | undefined,
  customerType: Audience,
): { firstName: string; lastName: string } {
  const full = (name ?? "").trim();
  if (customerType !== "d2c" || !full) return { firstName: "", lastName: "" };
  const parts = full.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const SAMPLE_MERGE_RE = new RegExp(
  `\\{\\{\\s*(${MERGE_FIELDS.map((f) => f.key).join("|")})\\s*\\}\\}`,
  "g",
);

/**
 * Substitute merge tokens with illustrative sample values, for editor previews.
 * The real, per-recipient substitution (with currency/date formatting) lives in
 * applyMergeFields() in send.ts — this is only a "what would it look like" pass.
 * Unknown tokens are left in place, matching the send-time behavior.
 */
export function applyMergeSample(template: string): string {
  return template.replace(SAMPLE_MERGE_RE, (_m, k: string) => SAMPLE_VARS[k] ?? _m);
}
