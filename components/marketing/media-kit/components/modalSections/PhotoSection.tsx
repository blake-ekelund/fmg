import { Upload } from "lucide-react";
import { PreviewTile } from "./PreviewTile";
import { AddTile } from "./AddTile";

type Props = {
  label: string;
  multiple: boolean;
};

export function PhotoSection({ label, multiple }: Props) {
  return (
    <div className="space-y-6 max-w-4xl">
      <h3 className="text-sm font-semibold text-gray-900">
        {label}
      </h3>

      <div className="rounded-2xl bg-gray-50 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <PreviewTile />
          {multiple && <AddTile />}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-yellow-600 cursor-pointer hover:text-yellow-700">
        <Upload size={16} />
        Upload {multiple ? "images" : "image"}
        <input
          type="file"
          className="hidden"
          accept="image/*"
          multiple={multiple}
        />
      </label>
    </div>
  );
}
