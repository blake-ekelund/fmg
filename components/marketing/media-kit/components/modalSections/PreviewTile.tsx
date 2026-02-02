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

      {/* Overlay (hover on desktop, always subtle on mobile) */}
      <div
        className="
          absolute inset-0
          bg-black/5
          md:bg-black/0
          md:group-hover:bg-black/20
          transition
        "
      />

      {/* Delete button */}
      <button
        onClick={onDelete}
        aria-label="Remove image"
        className="
          absolute top-2 right-2
          opacity-100 md:opacity-0 md:group-hover:opacity-100
          transition
          p-2
          rounded-full
          bg-white/90 hover:bg-white
          shadow
        "
      >
        <X size={14} className="text-gray-700" />
      </button>
    </div>
  );
}
