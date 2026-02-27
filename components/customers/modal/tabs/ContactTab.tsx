// /modal/tabs/ContactTab.tsx
"use client";

export default function ContactTab({ summary }: { summary: any }) {
  return (
    <div className="grid grid-cols-2 gap-8 text-sm">
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div className="font-semibold mb-3">Bill To</div>
        <div>{summary?.name ?? "—"}</div>
        <div>{summary?.bill_to_state ?? "—"}</div>
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div className="font-semibold mb-3">Contact</div>
        <div>{summary?.customercontact ?? "—"}</div>
        <div>{summary?.email ?? "—"}</div>
        <div>{summary?.phone ?? "—"}</div>
      </div>
    </div>
  );
}