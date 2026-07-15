"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import { Loader2, AlertTriangle, Sparkles, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useBrand } from "@/components/BrandContext";
import {
  useSalesDrivers,
  type Driver,
  type DriverDetail,
  type DriverPeriod,
} from "../hooks/useSalesDrivers";

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const signed = (n: number) => (n >= 0 ? "+" : "−") + money(Math.abs(n));

const PERIODS: { key: DriverPeriod; label: string }[] = [
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "ttm", label: "TTM" },
];

/**
 * "Why did sales change?" — an expandable YoY sales-driver bridge, comparing a
 * selectable period (MTD / YTD / trailing 12 months) against the matching
 * period last year. Shown inside the Monthly Sales widget; collapsed by default,
 * and the RPC only runs once opened.
 */
export default function SalesDriversPanel() {
  const { brand } = useBrand();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<DriverPeriod>("mtd");
  const { data, loading, error } = useSalesDrivers(brand, open, period);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Sparkles size={15} className="text-violet-500" />
          Why did sales change?
          <span className="text-[11px] font-normal text-gray-400">YoY drivers</span>
        </span>
        <ChevronDown
          size={16}
          className={clsx("text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          {/* Period selector */}
          <div className="mb-4 flex justify-end">
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    period === p.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                  title={
                    p.key === "mtd"
                      ? "Month to date"
                      : p.key === "ytd"
                        ? "Year to date"
                        : "Trailing 12 months"
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Crunching the numbers…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          ) : !data ? (
            <p className="py-4 text-sm text-gray-400">
              No completed days yet for this period — check back tomorrow.
            </p>
          ) : (
            <DriversBody data={data} />
          )}
        </div>
      )}
    </div>
  );
}

function DriversBody({
  data,
}: {
  data: {
    scopeLabel: string;
    comparisonLabel: string;
    windowLabel: string;
    delta: number;
    deltaPct: number | null;
    priorLabel: string;
    curLabel: string;
    priorRevenue: number;
    curRevenue: number;
    priorUnits: number;
    curUnits: number;
    drivers: Driver[];
  };
}) {
  const up = data.delta >= 0;

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div>
        <div className="text-sm text-gray-600">
          {data.scopeLabel} sales are{" "}
          <span className={clsx("font-semibold", up ? "text-emerald-600" : "text-rose-600")}>
            {up ? "up" : "down"} {money(Math.abs(data.delta))}
            {data.deltaPct != null && ` (${up ? "+" : "−"}${Math.abs(data.deltaPct).toFixed(0)}%)`}
          </span>{" "}
          vs {data.comparisonLabel}.
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">{data.windowLabel}</div>
      </div>

      {/* Waterfall bridge */}
      <Waterfall
        priorRevenue={data.priorRevenue}
        curRevenue={data.curRevenue}
        priorUnits={data.priorUnits}
        curUnits={data.curUnits}
        drivers={data.drivers}
        priorLabel={data.priorLabel}
        curLabel={data.curLabel}
      />
    </div>
  );
}

/* -------------------------------- waterfall ------------------------------- */

const TOTAL_COLOR = "#94a3b8"; // slate-400
const POS_COLOR = "#34d399"; // emerald-400
const NEG_COLOR = "#fb7185"; // rose-400

const SHORT_LABEL: Record<string, string> = {
  volume: "Volume",
  mix: "Mix",
  price: "Price",
  new: "New",
  lost: "Lost",
};

type Bar = {
  name: string;
  base: number; // transparent floor of the floating bar
  value: number; // visible height
  amount: number; // signed driver amount (or total for endpoints)
  kind: "total" | "pos" | "neg";
  dataLabel: string; // "$31.2k" / "+$4.3k" / "−$2.1k"
  detail: DriverDetail[]; // backing figures for the hover card
};

/** #,###.0k — thousands, comma-grouped, one decimal. e.g. 1_234_500 → "$1,234.5k". */
const kFmt = (n: number) =>
  "$" +
  (Math.abs(n) / 1000).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) +
  "k";
const kTick = (v: number) => kFmt(v);
const kLabel = (n: number) => kFmt(n);

const LABEL_COLOR = { total: "#475569", pos: "#059669", neg: "#e11d48" } as const;

function Waterfall({
  priorRevenue,
  curRevenue,
  priorUnits,
  curUnits,
  drivers,
  priorLabel,
  curLabel,
}: {
  priorRevenue: number;
  curRevenue: number;
  priorUnits: number;
  curUnits: number;
  drivers: Driver[];
  priorLabel: string;
  curLabel: string;
}) {
  const intFmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const bars: Bar[] = [];
  bars.push({
    name: priorLabel,
    base: 0,
    value: priorRevenue,
    amount: priorRevenue,
    kind: "total",
    dataLabel: kLabel(priorRevenue),
    detail: [
      { label: "Revenue", value: money(priorRevenue) },
      { label: "Units sold", value: intFmt(priorUnits) },
    ],
  });

  let running = priorRevenue;
  for (const d of drivers) {
    const name = SHORT_LABEL[d.key] ?? d.label;
    const dataLabel = (d.amount >= 0 ? "+" : "−") + kLabel(d.amount);
    if (d.amount >= 0) {
      bars.push({ name, base: running, value: d.amount, amount: d.amount, kind: "pos", dataLabel, detail: d.detail });
      running += d.amount;
    } else {
      running += d.amount; // running decreases
      bars.push({ name, base: running, value: -d.amount, amount: d.amount, kind: "neg", dataLabel, detail: d.detail });
    }
  }

  bars.push({
    name: curLabel,
    base: 0,
    value: curRevenue,
    amount: curRevenue,
    kind: "total",
    dataLabel: kLabel(curRevenue),
    detail: [
      { label: "Revenue", value: money(curRevenue) },
      { label: "Units sold", value: intFmt(curUnits) },
    ],
  });

  const colorFor = (b: Bar) =>
    b.kind === "total" ? TOTAL_COLOR : b.kind === "pos" ? POS_COLOR : NEG_COLOR;

  // Data label above each bar's visible top, colored + signed by kind.
  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const b = bars[props.index ?? -1];
    if (!b || b.value === 0) return null;
    const x = Number(props.x) + Number(props.width) / 2;
    const y = Number(props.y) - 5;
    return (
      <text x={x} y={y} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_COLOR[b.kind]}>
        {b.dataLabel}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={270}>
      <BarChart data={bars} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
        />
        <YAxis
          tickFormatter={kTick}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        {/* transparent floor to make the bars float */}
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {bars.map((b, i) => (
            <Cell key={i} fill={colorFor(b)} />
          ))}
          <LabelList dataKey="value" content={renderLabel} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WaterfallTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bar }[];
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="min-w-[180px] rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-gray-800">{b.name}</span>
        <span
          className={clsx(
            "font-semibold tabular-nums",
            b.kind === "total"
              ? "text-gray-700"
              : b.kind === "pos"
                ? "text-emerald-600"
                : "text-rose-600",
          )}
        >
          {b.kind === "total" ? money(b.amount) : signed(b.amount)}
        </span>
      </div>
      {b.detail.length > 0 && (
        <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5">
          {b.detail.map((d, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-gray-500">{d.label}</span>
              <span className="tabular-nums text-gray-800">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
