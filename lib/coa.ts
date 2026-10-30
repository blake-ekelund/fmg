/**
 * Chart of accounts: parse a QuickBooks Desktop account listing, and draft a
 * clean QuickBooks Online chart from it. Pure — no I/O — so the rules are
 * testable and the page can preview before saving.
 *
 * The draft follows FMG's chosen structure (Oct 30, 2026): ONE chart of
 * accounts for the company, with business unit — FMG (shared/core), Natural
 * Inspirations, Sassy and Co — as a tag (QBO class) on transactions, and only
 * Sales and COGS split into per-brand sub-accounts, because Fishbowl posts
 * those itself (income account per product, COGS account per part) and can
 * therefore keep them split with no hand-coding. Everything in the draft is a
 * suggestion for Julie, Blake and the CPA to edit.
 */

export const BUSINESS_UNITS = ["FMG", "Natural Inspirations", "Sassy and Co"] as const;
export type BusinessUnit = (typeof BUSINESS_UNITS)[number];

export const STATUSES = ["keep", "rename", "merge", "new", "retire"] as const;
export type CoaStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<CoaStatus, string> = {
  keep: "Keep",
  rename: "Rename",
  merge: "Merge into another",
  new: "New",
  retire: "Retire",
};

/** One account as QuickBooks Desktop lists it. */
export type CurrentAccount = {
  /** "Parent:Child" path without numbers — QuickBooks' own full name. */
  fullName: string;
  number: string | null;
  name: string;
  parent: string | null;
  type: string;
  balance: number | null;
  description: string | null;
  /** The description says Fishbowl posts to it by default. */
  fishbowlDefault: boolean;
};

/** One account in the proposed QBO chart. */
export type ProposedAccount = {
  id?: string;
  number: string | null;
  name: string;
  parent: string | null;
  type: string;
  detailType: string | null;
  businessUnit: BusinessUnit | null;
  status: CoaStatus;
  /** Current accounts (full names) whose balances/activity land here. */
  mapsFrom: string[];
  description: string | null;
  notes: string | null;
  fishbowlDefault: boolean;
  sort: number;
};

const FISHBOWL_DEFAULT = /DO NOT MODIFY WITHOUT CHANGING FROM DEFAULT IN FISHBOWL/i;

/** "40000 · Gross Sales" → number + name. Also handles "20060 - BONVOY…". */
export function splitNumber(segment: string): { number: string | null; name: string } {
  const s = segment.trim();
  const m = s.match(/^(\d{3,6})\s*[·\-–]\s*(.+)$/);
  return m ? { number: m[1], name: m[2].trim() } : { number: null, name: s };
}

/**
 * Parse the rows of QBD's "Account Listing" report export (Excel). Finds the
 * header row (Account / Type / Balance Total / Description / Accnt. #) wherever
 * it is, so extra blank columns QuickBooks adds don't matter.
 */
export function parseAccountListing(rows: unknown[][]): CurrentAccount[] {
  const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === "Account") && r.some((c) => norm(c) === "Type"));
  if (headerIdx === -1) throw new Error("Couldn't find the Account / Type header — export QuickBooks' Account Listing report to Excel.");
  const header = rows[headerIdx].map(norm);
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cAccount = col("Account");
  const cType = col("Type");
  const cBalance = col("Balance Total");
  const cDesc = col("Description");
  const cNum = col("Accnt. #");

  const out: CurrentAccount[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const raw = norm(r[cAccount]);
    if (!raw) continue;
    const segments = raw.split(":");
    const leaf = splitNumber(segments[segments.length - 1]);
    const parentSegs = segments.slice(0, -1).map((s) => splitNumber(s).name);
    const balRaw = cBalance >= 0 ? r[cBalance] : "";
    const balance = balRaw === "" || balRaw === null || balRaw === undefined ? null : Number(balRaw);
    const description = cDesc >= 0 ? norm(r[cDesc]) || null : null;
    out.push({
      fullName: [...parentSegs, leaf.name].join(":"),
      number: (cNum >= 0 && norm(r[cNum])) || leaf.number,
      name: leaf.name,
      parent: parentSegs.length ? parentSegs.join(":") : null,
      type: norm(r[cType]),
      balance: Number.isFinite(balance as number) ? (balance as number) : null,
      description: description && FISHBOWL_DEFAULT.test(description) ? "Fishbowl default account" : description,
      fishbowlDefault: !!description && FISHBOWL_DEFAULT.test(description),
    });
  }
  return out;
}

/** QuickBooks Desktop account type → the QBO account type name. */
export function qboType(qbdType: string): string {
  const map: Record<string, string> = {
    Bank: "Bank",
    "Accounts Receivable": "Accounts receivable (A/R)",
    "Other Current Asset": "Other Current Assets",
    "Fixed Asset": "Fixed Assets",
    "Other Asset": "Other Assets",
    "Accounts Payable": "Accounts payable (A/P)",
    "Credit Card": "Credit Card",
    "Other Current Liability": "Other Current Liabilities",
    "Long Term Liability": "Long Term Liabilities",
    Equity: "Equity",
    Income: "Income",
    "Cost of Goods Sold": "Cost of Goods Sold",
    Expense: "Expenses",
    "Other Income": "Other Income",
    "Other Expense": "Other Expense",
  };
  return map[qbdType] ?? qbdType;
}

/* ─── The draft ─────────────────────────────────────────────────────────── */

type Rule = { status: CoaStatus; into?: string; name?: string; number?: string; note: string };

/**
 * Suggested clean-ups, keyed by the current account's full name. Anything not
 * listed is kept as is. "into" names the PROPOSED account a merge lands in.
 */
const RULES: Record<string, Rule> = {
  "FB Mapping Issue BS": { status: "retire", note: "Suspense for Fishbowl mapping errors. Clear its balance, then retire." },
  "FB Mapping Issue PL": { status: "retire", note: "Suspense for Fishbowl mapping errors. Clear, then retire." },
  "Uncategorized Income": { status: "merge", into: "Uncategorized Income", note: "QBO has its own Uncategorized Income account." },
  "*Uncategorized Income": { status: "merge", into: "Uncategorized Income", note: "Duplicate of 41500. QBO has its own Uncategorized Income." },
  "Uncategorized Expenses": { status: "merge", into: "Uncategorized Expense", note: "QBO has its own Uncategorized Expense account." },
  "Ask My Accountant": { status: "merge", into: "Uncategorized Expense", note: "Use QBO's Uncategorized Expense for items awaiting review." },
  "Ask Julie": { status: "merge", into: "Uncategorized Expense", note: "Use QBO's Uncategorized Expense for items awaiting review." },
  "*Reconciliation Discrepancies": { status: "merge", into: "Uncategorized Expense", note: "Clear before cutover; QBO creates its own Reconciliation Discrepancies when needed." },
  "Unapplied Cash Bill Payment Exp": { status: "retire", note: "QuickBooks Desktop system account. Not needed in QBO." },
  "Opening Balance Equity - NEW": { status: "merge", into: "Opening Balance Equity", note: "Two opening-balance equity accounts — keep one (QBO creates it)." },
  "Opening Balance Equity": { status: "keep", note: "Should be zero after the CPA closes it to Member's Equity." },
  "Internal Use": { status: "merge", into: "Internal Use", number: "70700", note: "Duplicate of 70700 Internal Use FB." },
  "Internal Use FB": { status: "rename", name: "Internal Use", note: "One Internal Use account (Fishbowl default)." },
  "Non-Inventory": { status: "merge", into: "Non-Inventory", note: "Duplicate of 66700 Non Inventory - FB." },
  "Non Inventory - FB": { status: "rename", name: "Non-Inventory", note: "One Non-Inventory account (Fishbowl default)." },
  Service: { status: "merge", into: "Service", note: "Duplicate of 66800 Service FB." },
  "Service FB": { status: "rename", name: "Service", note: "One Service account (Fishbowl default)." },
  "MIscellaneous - FB": { status: "rename", name: "Miscellaneous", note: "Fix capitalisation (Fishbowl default)." },
  "Minnesota Department of Revenue": { status: "merge", into: "Sales Tax Payable", note: "QBO's sales tax centre keeps its own liability per agency." },
  "MN Sales Tax": { status: "merge", into: "Sales Tax Payable", note: "One sales tax liability; QBO tracks agencies separately." },
  "Accounts Receivable PY": { status: "merge", into: "Accounts Receivable", note: "Prior-year AR — clear into AR or write off before cutover." },
  "Accounts Payable - PY": { status: "merge", into: "Accounts Payable", note: "Prior-year AP — clear into AP before cutover." },
  "Bank Clearing Account": { status: "keep", note: "Zero balance. Retire if no longer used." },
  "Amazon Clearing": { status: "keep", note: "Used by the Amazon settlement entries." },
  "Prepaid Inventory": { status: "keep", note: "Zero balance. Retire if no longer used." },
  "Capital Equipment": { status: "keep", note: "Zero balance. Fishbowl default." },
  "Cost Variance": { status: "keep", note: "Zero balance. Fishbowl default." },
  "Other Accrued Liabilities": { status: "keep", note: "Zero balance. Retire if no longer used." },
  "NP - Wings Financial": { status: "retire", note: "Zero balance loan. Retire if paid off." },
  "Equity - Treasury": { status: "keep", note: "Zero balance. Confirm with the CPA." },
  "Shipping Misc": { status: "merge", into: "Shipping", note: "No number. Use 50375 Shipping." },
  "FB Fill Costs Accrual": { status: "keep", number: "20350", note: "Fishbowl posts fill parts here. Decide its treatment with the CPA (see QBO Transition)." },
};

/** Per-brand Sales and COGS sub-accounts — the only accounts split by brand. */
const BRAND_SPLITS: { parent: string; type: string; base: number; label: string; note: string }[] = [
  { parent: "Gross Sales", type: "Income", base: 40010, label: "Sales", note: "Fishbowl posts here per product (product income account)." },
  { parent: "COGS", type: "Cost of Goods Sold", base: 50010, label: "COGS", note: "Fishbowl posts here per part (part COGS account)." },
];

/**
 * A clean proposed chart, from the current one. Every current account appears
 * once (kept, renamed, merged or retired) so the Changes view accounts for all
 * of them; per-brand Sales/COGS sub-accounts are added as "new".
 */
export function draftProposedChart(current: CurrentAccount[]): ProposedAccount[] {
  const out: ProposedAccount[] = [];
  const byName = new Map<string, ProposedAccount>();
  let sort = 0;

  const add = (p: ProposedAccount) => {
    out.push(p);
    byName.set(p.name, byName.get(p.name) ?? p);
    return p;
  };

  // Pass 1: everything that survives (keep / rename), in QuickBooks' order.
  for (const c of current) {
    const rule = RULES[c.name];
    if (rule && (rule.status === "merge" || rule.status === "retire")) continue;
    add({
      number: rule?.number ?? c.number,
      name: rule?.name ?? c.name,
      parent: c.parent,
      type: qboType(c.type),
      detailType: null,
      businessUnit: null,
      status: rule?.status ?? "keep",
      mapsFrom: [c.fullName],
      description: c.description,
      notes: rule?.note ?? (c.number ? null : "No account number — assign one."),
      fishbowlDefault: c.fishbowlDefault,
      sort: sort++,
    });

    // Right after Gross Sales / COGS, add the per-brand sub-accounts.
    const split = BRAND_SPLITS.find((b) => b.parent === c.name && !c.parent);
    if (split) {
      BUSINESS_UNITS.forEach((bu, i) => {
        add({
          number: String(split.base + i * 10),
          name: `${split.label} - ${bu}`,
          parent: c.name,
          type: qboType(split.type),
          detailType: null,
          businessUnit: bu,
          status: "new",
          mapsFrom: [],
          description: null,
          notes: split.note,
          fishbowlDefault: false,
          sort: sort++,
        });
      });
    }
  }

  // QBO system accounts that merges land in, when the current chart lacks them.
  const ensure = (name: string, type: string, note: string) => {
    if (byName.has(name)) return byName.get(name) as ProposedAccount;
    return add({
      number: null,
      name,
      parent: null,
      type,
      detailType: null,
      businessUnit: null,
      status: "new",
      mapsFrom: [],
      description: null,
      notes: note,
      fishbowlDefault: false,
      sort: sort++,
    });
  };

  // Pass 2: merges point at their target; retires are listed so nothing is lost.
  for (const c of current) {
    const rule = RULES[c.name];
    if (!rule || (rule.status !== "merge" && rule.status !== "retire")) continue;
    if (rule.status === "merge" && rule.into) {
      const target =
        byName.get(rule.into) ??
        ensure(
          rule.into,
          rule.into === "Uncategorized Expense" ? "Expenses" : rule.into === "Uncategorized Income" ? "Income" : qboType(c.type),
          "QuickBooks Online system account.",
        );
      if (!target.mapsFrom.includes(c.fullName)) target.mapsFrom.push(c.fullName);
    }
    out.push({
      number: c.number,
      name: c.name,
      parent: c.parent,
      type: qboType(c.type),
      detailType: null,
      businessUnit: null,
      status: rule.status,
      mapsFrom: [c.fullName],
      description: c.description,
      notes: rule.status === "merge" ? `→ ${rule.into}. ${rule.note}` : rule.note,
      fishbowlDefault: c.fishbowlDefault,
      sort: sort++,
    });
  }

  return out;
}

/** "Parent:Child" full name of a proposed account. */
export const proposedFullName = (p: Pick<ProposedAccount, "name" | "parent">) => (p.parent ? `${p.parent}:${p.name}` : p.name);

/** Rows for QBO's chart-of-accounts import (Settings → Import data → Chart of accounts). */
export function qboImportRows(proposed: ProposedAccount[]): string[][] {
  const rows = [["Account Number", "Account Name", "Type", "Detail Type"]];
  for (const p of proposed) {
    if (p.status === "merge" || p.status === "retire") continue;
    rows.push([p.number ?? "", proposedFullName(p), p.type, p.detailType ?? ""]);
  }
  return rows;
}
