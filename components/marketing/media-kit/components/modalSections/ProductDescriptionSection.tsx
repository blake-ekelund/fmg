type Props = {
  shortDescription: string;
  longDescription: string;
  onShortChange: (v: string) => void;
  onLongChange: (v: string) => void;
};

export function ProductDescriptionSection({
  shortDescription,
  longDescription,
  onShortChange,
  onLongChange,
}: Props) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Short Description
        </label>
        <textarea
          rows={2}
          value={shortDescription}
          onChange={(e) => onShortChange(e.target.value)}
          placeholder="Used in cards, previews, summaries"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-yellow-200"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Long Description
        </label>
        <textarea
          rows={5}
          value={longDescription}
          onChange={(e) => onLongChange(e.target.value)}
          placeholder="Canonical description used by retailers"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-yellow-200"
        />
      </div>
    </div>
  );
}
