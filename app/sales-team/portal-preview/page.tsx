import RepPortalPreview from "@/components/sales-team/RepPortalPreview";

/**
 * Team → Rep Portal Preview. Owner/admin only (enforced by the nav role gate
 * and, for the data itself, by resolvePortalAgency server-side).
 */
export default function Page() {
  return <RepPortalPreview />;
}
