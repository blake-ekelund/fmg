/**
 * "What's new" — the changelog behind the top-bar Help (?) menu.
 *
 * Hand-maintained, newest FIRST. When a user-facing feature ships, add an
 * entry at the top: plain language, what it does for the reader, one or two
 * sentences. A new top entry lights the dot on the ? icon for everyone until
 * they open What's new (tracked per browser in localStorage).
 *
 * `href` is optional; an entry whose page a role can't open is hidden from
 * that role (see HelpMenu), so link entries to the page they're about.
 */

export type WhatsNewEntry = {
  /** Unique and stable — the "seen" marker stores the newest id. */
  id: string;
  /** yyyy-mm-dd it shipped. */
  date: string;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "2026-11-14-help-menu",
    date: "2026-11-14",
    title: "Report a bug, and create from anywhere",
    body:
      "This ? menu now has Report a bug (paste a screenshot straight in), What's new, Ask Sage and the user guide. The + next to search starts a new task, email template, social post or blog post from any page.",
  },
  {
    id: "2026-11-14-notification-bell",
    date: "2026-11-14",
    title: "Notification bell",
    body:
      "The bell in the top bar lists your tasks that are due or overdue, inventory to review, new orders, and reviews waiting for approval. Pick what it shows in Settings → Notifications.",
    href: "/settings?section=notifications",
    linkLabel: "Notification settings",
  },
  {
    id: "2026-11-14-profile-photo",
    date: "2026-11-14",
    title: "Profile photo and password",
    body: "Add a photo so teammates can spot you, and change your password, in Settings.",
    href: "/settings",
    linkLabel: "Open Settings",
  },
  {
    id: "2026-11-11-faire-payouts",
    date: "2026-11-11",
    title: "Faire Payouts as journal entries",
    body:
      "Each Faire payout is a numbered journal entry with an Excel download, plus an Entered-in-QBO tick so nothing is keyed twice.",
    href: "/accounting/faire-payouts",
    linkLabel: "Open Faire Payouts",
  },
  {
    id: "2026-11-02-custom-reports",
    date: "2026-11-02",
    title: "Custom Reports",
    body:
      "Ask Sage to build a dashboard of numbers, charts and tables from your data — and have it emailed to you on a schedule.",
    href: "/reports",
    linkLabel: "Open Reports",
  },
];

export const WHATS_NEW_SEEN_KEY = "fmg-whats-new-seen";
