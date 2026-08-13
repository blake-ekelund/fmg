"use client";

import { Share2 } from "lucide-react";

/**
 * Social Media Posts — scaffold. Standard page shell + empty state; the page
 * title is derived from the "Social Media Posts" nav label by TopBar.
 */
export default function SocialPostsPage() {
  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        Plan, draft, and track social media posts across the storefronts.
      </p>

      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
        <Share2 size={24} className="mx-auto text-gray-300" />
        <h2 className="mt-3 text-sm font-medium text-gray-900">
          Nothing here yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          Social media posts will show up here once this page is built out.
        </p>
      </div>
    </div>
  );
}
