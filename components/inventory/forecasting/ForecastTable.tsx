import ForecastRow from "./ForecastRow";
import { ForecastRow as Row } from "./types";

type Props = {
  rows: Row[];
  months: Date[];
  onUpdateAvg: (part: string, value: number) => void;
  onUpdateOnOrder: (part: string, value: number) => void;
};

export default function ForecastTable({
  rows,
  months,
  onUpdateAvg,
  onUpdateOnOrder,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="px-2 py-1.5 text-center w-8">Status</th>
            <th className="px-2 py-1.5 text-left">Part</th>
            <th className="px-2 py-1.5 text-left">Name</th>
            <th className="px-2 py-1.5 text-left">Fragrance</th>
            <th className="px-2 py-1.5 text-right">On Hand</th>
            <th className="px-2 py-1.5 text-right">On Order</th>
            <th className="px-2 py-1.5 text-right">Avg / Mo</th>

            {months.map((m) => (
              <th
                key={m.toISOString()}
                className="px-2 py-1.5 text-right whitespace-nowrap"
              >
                {m.toLocaleDateString("en-US", {
                  month: "short",
                  year: "2-digit",
                })}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <ForecastRow
              key={r.part}
              row={r}
              months={months}
              onUpdateAvg={onUpdateAvg}
              onUpdateOnOrder={onUpdateOnOrder}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
