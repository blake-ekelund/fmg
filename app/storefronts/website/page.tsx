import { Suspense } from "react";
import SiteEditorPage from "@/components/storefronts/site/SiteEditorPage";

/**
 * Website — block editor for the Sassy storefront pages (?page=<slug>; the
 * list lives in lib/site/pageDefaults.ts). The page title comes from the
 * "Website" nav label via TopBar. Suspense: the editor reads ?page= with
 * useSearchParams.
 */
export default function WebsiteRoute() {
  return (
    <Suspense>
      <SiteEditorPage />
    </Suspense>
  );
}
