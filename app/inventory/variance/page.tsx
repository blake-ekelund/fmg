import VarianceReport from "@/components/inventory/VarianceReport";

export const metadata = { title: "Variance Report" };

export default function VarianceRoute() {
  return (
    <div className="px-4 md:px-8 py-4 md:py-5">
      <VarianceReport />
    </div>
  );
}
