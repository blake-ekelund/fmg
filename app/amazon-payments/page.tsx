import { redirect } from "next/navigation";

// Moved into the Accounting section. Keep this path as a redirect so existing
// bookmarks don't 404.
export default function AmazonPaymentsPage() {
  redirect("/accounting/amazon-payments");
}
