import { redirect } from "next/navigation";

// The old "Data uploads" page is now the /integrations hub (Fishbowl + manual
// uploads live there). Keep this path as a redirect so existing bookmarks and
// in-app links don't 404.
export default function DataPage() {
  redirect("/integrations");
}
