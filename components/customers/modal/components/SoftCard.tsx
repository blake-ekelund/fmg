// /modal/components/SoftCard.tsx
"use client";

export default function SoftCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm p-6">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}