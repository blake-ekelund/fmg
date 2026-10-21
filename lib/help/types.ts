/**
 * One page (or page area) of the in-app user guide. The help assistant reads
 * these to answer "how do I…" questions, and they double as the written manual.
 *
 * Write for a non-technical staff member: what the page is for, what each
 * control does, and step-by-step recipes for the common tasks. Describe only
 * what the UI actually does today — never invent buttons.
 */
export type GuideEntry = {
  /** Route as it appears in the address bar, e.g. "/storefronts/purchases". Dynamic segments as [id]. */
  path: string;
  /** Page title as shown in the sidebar / page header. */
  title: string;
  /** Sidebar section, e.g. "Storefronts". Empty for top-level items. */
  section: string;
  /** One sentence: what this page is for. */
  summary: string;
  /** Markdown body: layout, controls, and "How to…" recipes. */
  body: string;
};
