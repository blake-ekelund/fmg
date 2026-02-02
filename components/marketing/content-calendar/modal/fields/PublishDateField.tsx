type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function PublishDateField({ value, onChange }: Props) {
  return (
    <label className="block text-sm font-medium">
      Publish Date
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
