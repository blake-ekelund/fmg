import { Table } from "@/components/sales/Table";
import BomRow from "./BomRow";

export default function BomTable() {
  return (
    <section className="border border-gray-200 rounded-2xl p-6">
      <h2 className="text-lg font-medium mb-4">
        BOM Materials
      </h2>

      <Table>
        <BomRow
          material="Vanilla Fragrance Oil"
          uom="ml"
          onHand={2400}
          allocated={1200}
          available={1200}
        />
        <BomRow
          material="Shea Butter Base"
          uom="kg"
          onHand={1800}
          allocated={1400}
          available={400}
        />
        <BomRow
          material="12oz Jar Packaging"
          uom="units"
          onHand={1200}
          allocated={1100}
          available={100}
        />
      </Table>
    </section>
  );
}
