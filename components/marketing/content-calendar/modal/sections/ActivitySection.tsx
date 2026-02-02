import { ContentMeta } from "../../types";

type Props = {
  meta?: ContentMeta | null;
};

export function ActivitySection({ meta }: Props) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <strong>Created</strong>
        <div className="text-gray-500">
          {meta?.created_at ?? "Not saved yet"}
        </div>
      </div>

      <div className="rounded-xl border border-dashed p-4 text-gray-500">
        Activity log coming soon.
      </div>
    </div>
  );
}
