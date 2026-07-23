"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import type { CustomerViewMode } from "./constants";
import CustomersHeader from "./CustomersHeader";
import MultiSelectFilter from "./MultiSelectFilter";
import type { CustomerStats } from "./hooks/queryHelpers";
import { formatCompactCount } from "./customerDisplay";

type Option = { label: string; value: string };
type SpendOption = { label: string; value: string };

/** Re-exported under the old name so existing importers keep working. */
export type CustomersStats = CustomerStats;

export default function CustomersFilters({
  viewMode = "wholesale",
  search,
  setSearch,
  status,
  setStatus,
  channel,
  setChannel,
  channelOptions,
  agency = "",
  setAgency,
  agencyOptions = [],
  states = [],
  setStates,
  stateOptions = [],
  repeatOnly = false,
  setRepeatOnly,
  spendBucket = "",
  setSpendBucket,
  spendBucketOptions,
  stats,
  onDownload,
  downloading,
  exportColumns,
  setExportColumns,
}: {
  viewMode?: CustomerViewMode;
  search: string;
  setSearch: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  channel: string;
  setChannel: (v: string) => void;
  channelOptions: Option[];
  agency?: string;
  setAgency?: (v: string) => void;
  agencyOptions?: Option[];
  states?: string[];
  setStates?: (v: string[]) => void;
  stateOptions?: Option[];
  repeatOnly?: boolean;
  setRepeatOnly?: (v: boolean) => void;
  spendBucket?: string;
  setSpendBucket?: (v: string) => void;
  spendBucketOptions?: SpendOption[];
  stats: CustomersStats;
  onDownload: () => void;
  downloading?: boolean;
  exportColumns: Record<string, boolean>;
  setExportColumns: (cols: Record<string, boolean>) => void;
}) {
  // The advanced row stays open between renders so a user who's mid-tuning
  // doesn't have to re-open it after every interaction.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // "All" is its own exact count, not a sum of the three status buckets —
  // summing silently omitted customers who have never ordered, which made this
  // pill disagree with the pagination total underneath it.
  const allCount = stats.all;

  // Number of advanced filters currently active — surfaced on the toggle so
  // users don't forget they have hidden filters applied.
  const advancedActive =
    (channel ? 1 : 0) +
    (agency ? 1 : 0) +
    (states.length > 0 ? 1 : 0) +
    (spendBucket ? 1 : 0) +
    (repeatOnly ? 1 : 0);

  const hasAdvanced =
    (viewMode === "wholesale" && channelOptions.length > 0) ||
    (viewMode === "wholesale" && agencyOptions.length > 0 && !!setAgency) ||
    (stateOptions.length > 0 && !!setStates) ||
    (!!setSpendBucket && !!spendBucketOptions && spendBucketOptions.length > 0) ||
    !!setRepeatOnly;

  function clearAdvanced() {
    setChannel("");
    setAgency?.("");
    setStates?.([]);
    setSpendBucket?.("");
    setRepeatOnly?.(false);
  }

  return (
    <div className="space-y-2">
      {/* Top toolbar. On phones this is two stacked rows — a full-width search
          above a scrollable pill strip — instead of one wrapping flex row that
          collapsed into a ragged four-line stack at 375px. */}
      <div className="space-y-2 md:flex md:flex-wrap md:items-center md:gap-2 md:space-y-0">
        {/* Search */}
        <div className="relative w-full md:flex-1 md:min-w-[200px] md:max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewMode === "d2c" ? "Search name or email…" : "Search customer…"
            }
            // 16px text on mobile — anything smaller makes iOS Safari zoom the
            // viewport on focus and the user has to pinch back out.
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 md:py-1.5 md:text-sm"
          />
        </div>

        {/* Status pills · scroll sideways on phones rather than wrapping */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
            <Pill
              label={`All (${formatCompactCount(allCount)})`}
              title={`${allCount.toLocaleString()} customers`}
              active={status === ""}
              onClick={() => setStatus("")}
            />
            <Pill
              label={`Active (${formatCompactCount(stats.active)})`}
              title={`${stats.active.toLocaleString()} active`}
              active={status === "active"}
              onClick={() => setStatus(status === "active" ? "" : "active")}
              tone="green"
            />
            <Pill
              label={`At Risk (${formatCompactCount(stats.atRisk)})`}
              title={`${stats.atRisk.toLocaleString()} at risk`}
              active={status === "at_risk"}
              onClick={() => setStatus(status === "at_risk" ? "" : "at_risk")}
              tone="amber"
            />
            <Pill
              label={`Churned (${formatCompactCount(stats.churned)})`}
              title={`${stats.churned.toLocaleString()} churned`}
              active={status === "churned"}
              onClick={() => setStatus(status === "churned" ? "" : "churned")}
              tone="gray"
            />
          </div>
        </div>

        {/* More filters + Export share a row on phones */}
        <div className="flex items-center gap-2 md:contents">
          {hasAdvanced && (
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={clsx(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition md:min-h-0 md:px-2.5 md:py-1.5",
                showAdvanced || advancedActive > 0
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
              )}
            >
              <SlidersHorizontal size={13} />
              Filters
              {advancedActive > 0 && (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums",
                    showAdvanced || advancedActive > 0
                      ? "bg-white/20"
                      : "bg-gray-100 text-gray-500",
                  )}
                >
                  {advancedActive}
                </span>
              )}
            </button>
          )}

          <div className="ml-auto">
            <CustomersHeader
              onDownload={onDownload}
              downloading={downloading}
              exportColumns={exportColumns}
              setExportColumns={setExportColumns}
            />
          </div>
        </div>
      </div>

      {/* Advanced filter row (disclosure). Each control goes full-width on a
          phone so the dropdowns are tappable instead of 90px slivers. */}
      {showAdvanced && (
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center [&>*]:w-full md:[&>*]:w-auto">
          {viewMode === "wholesale" && channelOptions.length > 0 && (
            <FilterSelect
              value={channel}
              onChange={setChannel}
              placeholder="All channels"
              options={channelOptions}
            />
          )}

          {viewMode === "wholesale" &&
            agencyOptions.length > 0 &&
            setAgency && (
              <FilterSelect
                value={agency}
                onChange={setAgency}
                placeholder="All agencies"
                options={agencyOptions}
              />
            )}

          {stateOptions.length > 0 && setStates && (
            <MultiSelectFilter
              selected={states}
              onChange={setStates}
              options={stateOptions}
              placeholder="All states"
              searchPlaceholder="Search states…"
              noun="states"
            />
          )}

          {setSpendBucket &&
            spendBucketOptions &&
            spendBucketOptions.length > 0 && (
              <FilterSelect
                value={spendBucket}
                onChange={setSpendBucket}
                placeholder="Any spend"
                options={spendBucketOptions}
              />
            )}

          {setRepeatOnly && (
            <button
              onClick={() => setRepeatOnly(!repeatOnly)}
              className={clsx(
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                repeatOnly
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
              )}
            >
              Repeat customers only
            </button>
          )}

          {advancedActive > 0 && (
            <button
              onClick={clearAdvanced}
              className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition"
              title="Reset all advanced filters"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Pill (segmented) ─── */

function Pill({
  label,
  title,
  active,
  onClick,
  tone,
}: {
  label: string;
  /** Exact count on hover, since the label rounds to 2.4k. */
  title?: string;
  active: boolean;
  onClick: () => void;
  tone?: "green" | "amber" | "gray";
}) {
  let activeClass = "bg-gray-900 text-white";
  if (tone === "green") activeClass = "bg-green-100 text-green-800";
  if (tone === "amber") activeClass = "bg-amber-100 text-amber-800";
  if (tone === "gray") activeClass = "bg-gray-200 text-gray-700";
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        "inline-flex min-h-[40px] items-center whitespace-nowrap rounded-md px-3 text-xs font-medium transition md:min-h-0 md:px-2.5 md:py-1",
        active ? activeClass : "text-gray-600 hover:text-gray-900",
      )}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Option[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[40px] rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 transition focus:outline-none focus:ring-2 focus:ring-gray-300 md:min-h-0 md:py-1.5 md:text-xs"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
