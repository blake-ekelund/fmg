import CommissionAgencyPage from "@/components/commission-reporting/CommissionAgencyPage";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  return (
    <CommissionAgencyPage
      agencyCode={decodeURIComponent(code)}
      initialYear={sp.year ? Number(sp.year) : undefined}
      initialMonth={sp.month ? Number(sp.month) : undefined}
    />
  );
}
