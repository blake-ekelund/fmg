import { redirect } from "next/navigation";

// Partners moved under the Storefronts section and was renamed to
// /storefronts/accounts. Keep this path as a redirect so existing bookmarks
// and links don't 404.
export default function PartnersRedirect() {
  redirect("/storefronts/accounts");
}
