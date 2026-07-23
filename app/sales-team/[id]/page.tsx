import RepDetailPage from "@/components/sales-team/RepDetailPage";

/**
 * Default detail page for every rep. The fuller build-out (performance,
 * accounts, activity) lands here later; for now it renders the roster record
 * plus placeholders for those sections.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RepDetailPage repId={id} />;
}
