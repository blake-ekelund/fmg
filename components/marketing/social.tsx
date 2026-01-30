// /marketing/MarketingSocialSection.tsx
"use client";

import {
  Instagram,
  Music2,
  Facebook,
} from "lucide-react";

export default function MarketingSocialSection() {
  return (
    <section className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
      <h2 className="text-lg font-medium mb-2">
        Social Media Analytics
      </h2>

      <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
        Instagram, TikTok, and Facebook performance metrics will
        appear here once accounts are connected.
      </p>

      <div className="flex justify-center gap-6 text-gray-400">
        <PlatformIcon label="Instagram">
          <Instagram />
        </PlatformIcon>
        <PlatformIcon label="TikTok">
          <Music2 />
        </PlatformIcon>
        <PlatformIcon label="Facebook">
          <Facebook />
        </PlatformIcon>
      </div>

      <div className="mt-6 text-xs text-gray-400">
        Coming soon
      </div>
    </section>
  );
}

function PlatformIcon({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-full bg-gray-100 p-4">
        {children}
      </div>
      <span className="text-xs">{label}</span>
    </div>
  );
}
