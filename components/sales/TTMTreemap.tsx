"use client";

import { ResponsiveContainer, Treemap, Tooltip } from "recharts";

type Item = {
  name: string;
  value: number; // TTM total
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
function TreemapCell(props: any) {
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

  // Soft, deterministic palette
  const colors = [
    "#1B3C53",
    "#234C6A",
    "#456882",
    "#2F5D7A",
    "#3E6E8A",
    "#5A7F98",
    "#2A475D",
    "#355D77",
    "#4B7895",
    "#6A8FA6",
    "#2E5168",
    "#3C6A86",
    "#517E97",
    "#6D95AC",
    "#2B4A60",
  ];

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-medium text-gray-800">
          {title}
        </div>
        <div className="text-xs text-gray-500">
          Share of trailing 12-month revenue
        </div>
      </div>

      <div className="h-75">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="value"
            stroke="#ffffff"
            content={(p) =>
              TreemapCell({
                ...p,
                colors,
                total,
              })
            }
          >
            <Tooltip
              content={({ active, payload }: any) => {
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
