// components/sales/Table.tsx
"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
};

export function Table({ children }: Props) {
  return (
    <div className="divide-y divide-gray-200">
      {children}
    </div>
  );
}
