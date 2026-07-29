import { redirect } from "next/navigation";

/**
 * The plain-text "Email Templates" page merged into the unified /templates
 * library (plain-text lives there as source='text'). This route is kept as a
 * permanent redirect so old links and bookmarks still land somewhere useful.
 */
export default function EmailTemplatesRoute() {
  redirect("/templates");
}
