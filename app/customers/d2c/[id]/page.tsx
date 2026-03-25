import CustomerDetailPage from "@/components/customers/CustomerDetailPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailPage customerId={decodeURIComponent(id)} isD2C />;
}
