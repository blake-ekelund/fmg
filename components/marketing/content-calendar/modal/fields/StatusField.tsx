import { ContentStatus } from "../../types";

type Props = {
  value: ContentStatus;
  onChange: (v: ContentStatus) => void;
};

export function StatusField({ value, onChange }: Props) {
  return (
    <label className="block text-sm font-medium">
      Status
      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value as ContentStatus)
        }
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      >
        <option>Not Started</option>
        <option>In Progress</option>
        <option>Ready</option>
      </select>
    </label>
  );
}
