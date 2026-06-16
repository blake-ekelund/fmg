import OrderDetailPage from "@/components/storefronts/OrderDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetailPage orderId={decodeURIComponent(id)} />;
}
