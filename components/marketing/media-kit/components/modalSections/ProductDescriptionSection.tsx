type Props = {
  shortDescription: string;
  longDescription: string;
  benefits: string;
  onShortChange: (v: string) => void;
  onLongChange: (v: string) => void;
  onBenefitsChange: (v: string) => void;
};

export function ProductDescriptionSection({
  shortDescription,
  longDescription,
  benefits,
  onShortChange,
  onLongChange,
  onBenefitsChange,
}: Props) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Section Header (matches photo sections) */}
      <h3 className="text-sm font-semibold text-gray-900">
        Product Description
      </h3>

      {/* Short Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Short Description
        </label>
        <textarea
          rows={1}
          value={shortDescription}
          onChange={(e) => onShortChange(e.target.value)}
          placeholder="Used in cards, previews, summaries"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     focus:ring-2 focus:ring-yellow-200"
        />
      </div>

      {/* Long Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Long Description
        </label>
        <textarea
          rows={3}
          value={longDescription}
          onChange={(e) => onLongChange(e.target.value)}
          placeholder="Canonical description used by retailers"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     focus:ring-2 focus:ring-yellow-200"
        />
      </div>

      {/* Benefits */}
      <div className="space-y-1">
        <label className="text-sm font-medium">
          Benefits
        </label>
        <textarea
          rows={5}
          value={benefits}
          onChange={(e) => onBenefitsChange(e.target.value)}
          placeholder="• Gently cleanses without drying&#10;• Plant-based ingredients&#10;• Safe for daily use"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     focus:ring-2 focus:ring-yellow-200"
        />
      </div>
    </div>
  );
}
