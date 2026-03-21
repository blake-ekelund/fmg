"use client";

import clsx from "clsx";

export type Tab<T extends string = string> = {
  value: T;
  label: string;
};

type TabNavProps<T extends string> = {
  tabs: Tab<T>[];
  active: T;
  onChange: (value: T) => void;
};

export default function TabNav<T extends string>({
  tabs,
  active,
  onChange,
}: TabNavProps<T>) {
  return (
    <nav className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
            active === tab.value
              ? "bg-gray-100 text-gray-900"
              : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
