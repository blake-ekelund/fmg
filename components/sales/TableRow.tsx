import clsx from "clsx";
import { accentBg } from "@/components/navConfig";

export function TableRow({
  name,
  value,
  secondary,
  accent,
}: {
  name: string;
  value: string;
  secondary?: string;
  accent?: keyof typeof accentBg;
}) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <div className="font-medium">
          {name}
        </div>
        {secondary && (
          <div className="text-sm text-gray-500">
            {secondary}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="font-medium">
          {value}
        </div>
        {accent && (
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              accentBg[accent]
            )}
          />
        )}
      </div>
    </div>
  );
}
