import { ReactNode } from "react";

type TableProps = {
  children: ReactNode;
};

export function Table({ children }: TableProps) {
  return (
    <div className="space-y-4 md:space-y-0">
      <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="divide-y divide-gray-100">
          {children}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {children}
      </div>
    </div>
  );
}
