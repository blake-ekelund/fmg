// /modal/components/SidebarItem.tsx
"use client";

export default function SidebarItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
        active
          ? "bg-white shadow-sm border border-slate-200/60 text-slate-900"
          : "text-slate-500 hover:bg-white/70"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}