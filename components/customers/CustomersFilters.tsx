"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";
import type { CustomerViewMode } from "./constants";
import CustomersHeader from "./CustomersHeader";
import MultiSelectFilter from "./MultiSelectFilter";

type Option = { label: string; value: string };
type SpendOption = { label: string; value: string };

export type CustomersStats = {
  active: number;
  atRisk: number;
  churned: number;
};

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

  // "All" count = total customers in the cross-filtered pool (stats already
  // ignore the status dimension). Counts of customers with no order date at
  // all are excluded — acceptable trade-off for a clean tabbed summary.
  const allCount = stats.active + stats.atRisk + stats.churned;

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
      {/* Top toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              viewMode === "d2c" ? "Search name or email…" : "Search customer…"
            }
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {/* Status pills with counts */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
          <Pill
            label={`All (${allCount.toLocaleString()})`}
            active={status === ""}
            onClick={() => setStatus("")}
          />
          <Pill
            label={`Active (${stats.active.toLocaleString()})`}
            active={status === "active"}
            onClick={() => setStatus(status === "active" ? "" : "active")}
            tone="green"
          />
          <Pill
            label={`At Risk (${stats.atRisk.toLocaleString()})`}
            active={status === "at_risk"}
            onClick={() => setStatus(status === "at_risk" ? "" : "at_risk")}
            tone="amber"
          />
          <Pill
            label={`Churned (${stats.churned.toLocaleString()})`}
            active={status === "churned"}
            onClick={() => setStatus(status === "churned" ? "" : "churned")}
            tone="gray"
          />
        </div>

        {/* More filters toggle */}
        {hasAdvanced && (
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              showAdvanced || advancedActive > 0
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300",
            )}
          >
            <SlidersHorizontal size={13} />
            More filters
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

        {/* Export (pushed right) */}
        <div className="ml-auto">
          <CustomersHeader
            onDownload={onDownload}
            downloading={downloading}
            exportColumns={exportColumns}
            setExportColumns={setExportColumns}
          />
        </div>
      </div>

      {/* Advanced filter row (disclosure) */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
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
  active,
  onClick,
  tone,
}: {
  label: string;
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
      className={clsx(
        "rounded-md px-2.5 py-1 text-xs font-medium transition",
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
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
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
