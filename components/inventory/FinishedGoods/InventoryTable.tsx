import InventoryRow from "./InventoryRow";
import { Table } from "@/components/sales/Table";

export default function InventoryTable() {
  return (
    <section className="border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-medium mb-4">
        Finished Goods by Warehouse
      </h2>

      <Table>
        <InventoryRow
          name="Bestie"
          warehouse="Minneapolis"
          onHand={1120}
          onOrder={300}
          available={920}
        />
        <InventoryRow
          name="Bougie Babe"
          warehouse="Van Fleet"
          onHand={840}
          onOrder={500}
          available={480}
        />
        <InventoryRow
          name="Hot Mess"
          warehouse="St. Paul"
          onHand={420}
          onOrder={0}
          available={120}
        />
      </Table>
    </section>
  );
}
