type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function NotesSection({ value, onChange }: Props) {
  return (
    <div className="space-y-6 max-w-2xl">
      {/* Section Header */}
      <h3 className="text-sm font-semibold text-gray-900">
        Notes for 3rd Parties
      </h3>

      {/* Notes Field */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Internal / Partner Notes
        </label>
        <textarea
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Usage guidance, restrictions, retailer notes, compliance reminders…"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     focus:ring-2 focus:ring-yellow-200"
        />
        <p className="text-xs text-gray-500">
          Not shown publicly. Used for retailers, distributors, and internal context.
        </p>
      </div>
    </div>
  );
}
