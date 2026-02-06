"use client";

import "@/lib/chartjs"; // 🔑 THIS IS THE FIX
import { Bar } from "react-chartjs-2";

type Props = {
  months: string[];
  currentYear: number;
  priorYear: number;
  currentYearData: number[];
  priorYearData: number[];
};

export function SalesYearComparisonChart({
  months,
  currentYear,
  priorYear,
  currentYearData,
  priorYearData,
}: Props) {
  return (
    <div className="h-[360px]">
      <Bar
        data={{
          labels: months,
          datasets: [
            {
              label: `${priorYear}`,
              data: priorYearData,
            },
            {
              label: `${currentYear}`,
              data: currentYearData,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top" },
          },
          scales: {
            y: {
              ticks: {
                callback: (v) => `$${v}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
