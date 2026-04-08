"use client";

import { Construction } from "lucide-react";

type Props = {
  message?: string;
};

export default function PlaceholderView({ message = "Coming soon" }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Construction size={32} className="mb-2" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
