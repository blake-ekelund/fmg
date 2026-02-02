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
    <div className="space-y-6 max-w-none md:max-w-3xl">
      {/* Section Header */}
      <h3 className="text-sm font-semibold text-gray-900">
        Product Description
      </h3>

      {/* Short Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-800">
          Short Description
        </label>
        <textarea
          rows={2}
          value={shortDescription}
          onChange={(e) => onShortChange(e.target.value)}
          placeholder="Used in cards, previews, summaries"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     resize-none
                     focus:ring-2 focus:ring-yellow-200 focus:border-yellow-300"
        />
      </div>

      {/* Long Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-800">
          Long Description
        </label>
        <textarea
          rows={4}
          value={longDescription}
          onChange={(e) => onLongChange(e.target.value)}
          placeholder="Canonical description used by retailers"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     resize-y
                     focus:ring-2 focus:ring-yellow-200 focus:border-yellow-300"
        />
      </div>

      {/* Benefits */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-800">
          Benefits
        </label>
        <textarea
          rows={6}
          value={benefits}
          onChange={(e) => onBenefitsChange(e.target.value)}
          placeholder="• Gently cleanses without drying&#10;• Plant-based ingredients&#10;• Safe for daily use"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm
                     resize-y
                     focus:ring-2 focus:ring-yellow-200 focus:border-yellow-300"
        />
      </div>
    </div>
  );
}
