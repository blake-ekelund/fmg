import { redirect } from "next/navigation";

// Renamed to /storefronts/accounts (the page now covers D2C + wholesale, not
// just wholesale applications). Keep this path as a redirect so existing
// bookmarks and links don't 404.
export default function PartnersRedirect() {
  redirect("/storefronts/accounts");
}
