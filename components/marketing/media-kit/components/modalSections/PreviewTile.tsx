import { X } from "lucide-react";

type Props = {
  src: string;
  onDelete: () => void;
};

export function PreviewTile({ src, onDelete }: Props) {
  return (
    <div className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
      {/* Image */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="
          absolute top-2 right-2
          opacity-0 group-hover:opacity-100
          transition
          p-1.5 rounded-full
          bg-white/90 hover:bg-white
          shadow
        "
        aria-label="Remove image"
      >
        <X size={14} className="text-gray-700" />
      </button>
    </div>
  );
}
