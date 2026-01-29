import { Stat } from "@/components/sales/Stat";

export default function InventoryKpiGrid({ mode }: { mode: "fg" | "bom" }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {mode === "fg" ? (
        <>
          <Stat label="On Hand" value="4,820 units" />
          <Stat label="On Order" value="1,300 units" />
          <Stat label="Available" value="3,920 units" />
          <Stat label="Low Stock SKUs" value="6" />
        </>
      ) : (
        <>
          <Stat label="Materials On Hand" value="8,420 units" />
          <Stat label="Allocated to WIP" value="3,200 units" />
          <Stat label="Available" value="5,220 units" />
          <Stat label="Materials at Risk" value="4" />
        </>
      )}
    </section>
  );
}
