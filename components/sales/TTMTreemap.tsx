"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import { CHART_NAVY_PALETTE } from "@/lib/colors";

type Item = {
  name: string;
  value: number; // TTM total
};

type TreemapCellProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  value: number;
  index: number;
  colors: readonly string[];
  total: number;
};

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Recharts Treemap custom renderer
 * - Smaller text
 * - No bold
 * - Adds % of total
 */
function TreemapCell(props: TreemapCellProps) {
  const {
    x,
    y,
    width,
    height,
    name,
    value,
    index,
    colors,
    total,
  } = props;

  const fill = colors[index % colors.length];
  const canLabel = width > 110 && height > 40;
  const pct = value / total;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={2}
        rx={10}
        ry={10}
      />

      {canLabel && (
        <>
          {/* Product name */}
          <text
            x={x + 8}
            y={y + 16}
            fill="rgba(255,255,255,0.95)"
            fontSize={10}
          >
            {name}
          </text>

          {/* Dollar value */}
          <text
            x={x + 8}
            y={y + 30}
            fill="rgba(255,255,255,0.9)"
            fontSize={9}
          >
            ${fmtMoney(value)}
          </text>

          {/* Percent of total */}
          <text
            x={x + 8}
            y={y + 42}
            fill="rgba(255,255,255,0.8)"
            fontSize={9}
          >
            {fmtPct(pct)}
          </text>
        </>
      )}
    </g>
  );
}

export function TTMTreemap({
  title = "Top 15 Products — TTM Revenue Share",
  items,
}: {
  title?: string;
  items: Item[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0);

  // Recharts treemap expects a hierarchical root
  const data = [
    {
      name: "TTM",
      children: items.map((i) => ({
        name: i.name,
        value: i.value,
      })),
    },
  ];

  const colors = CHART_NAVY_PALETTE;

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-gray-900">
          {title}
        </h3>
        <span className="text-[10px] text-gray-400">
          Share of TTM revenue
        </span>
      </div>

      <div className="h-75">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="value"
            stroke="rgba(255,255,255,0.9)"
            content={(p) =>
              TreemapCell({
                ...p,
                colors,
                total,
              })
            }
          >
            <Tooltip
              content={({ active, payload }: TooltipContentProps<number, string>) => {
                if (!active || !payload?.length)
                  return null;

                const node = payload[0]?.payload;
                if (!node?.name || node?.value == null)
                  return null;

                const pct = node.value / total;

                return (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
                    <div className="font-medium text-gray-900">
                      {node.name}
                    </div>
                    <div className="text-gray-600">
                      TTM: ${fmtMoney(node.value)}
                    </div>
                    <div className="text-gray-500">
                      Share: {fmtPct(pct)}
                    </div>
                  </div>
                );
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
