import InvoiceDetailPage from "@/components/commission-reporting/InvoiceDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  return <InvoiceDetailPage orderNum={decodeURIComponent(num)} />;
}
