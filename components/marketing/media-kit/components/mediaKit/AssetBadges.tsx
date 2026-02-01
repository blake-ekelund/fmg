import {
  ImageIcon,
  FileTextIcon,
  CheckCircle,
  Plus,
} from "lucide-react";
import { AssetType, AssetStatus } from "./types";

type Props = {
  type: AssetType;
  status: AssetStatus;
};

export function AssetBadge({ type, status }: Props) {
  const labelMap: Record<AssetType, string> = {
    front: "Front",
    benefits: "Benefits",
    lifestyle: "Lifestyle",
    ingredients: "Ingredients",
    fragrance: "Fragrance",
    other: "Other",
  };

  const Icon =
    type === "fragrance" ? FileTextIcon : ImageIcon;

  const isPresent = status === "present";

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
        transition
        ${
          isPresent
            ? "bg-yellow-50 text-gray-900 ring-1 ring-yellow-400/40 hover:bg-yellow-100"
            : "bg-gray-100 text-gray-400 ring-1 ring-gray-200 border-dashed"
        }
      `}
      title={
        isPresent
          ? `${labelMap[type]} uploaded`
          : `${labelMap[type]} missing`
      }
    >
      {isPresent ? (
        <CheckCircle
          size={14}
          className="text-yellow-500"
        />
      ) : (
        <Plus
          size={14}
          className="text-gray-400"
        />
      )}

      <Icon size={14} />
      <span>{labelMap[type]}</span>
    </div>
  );
}
