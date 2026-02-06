import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function Table({ children }: Props) {
  return (
    <div className="divide-y divide-gray-100">
      {children}
    </div>
  );
}
