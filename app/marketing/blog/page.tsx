"use client";

import { Newspaper } from "lucide-react";

/**
 * Blog Posts — scaffold. Standard page shell + empty state; the page title is
 * derived from the "Blog Posts" nav label by TopBar.
 */
export default function BlogPostsPage() {
  return (
    <div className="w-full space-y-6 p-6 md:px-8">
      <p className="max-w-2xl text-sm text-gray-500">
        Draft, edit, and publish blog posts for the storefronts.
      </p>

      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
        <Newspaper size={24} className="mx-auto text-gray-300" />
        <h2 className="mt-3 text-sm font-medium text-gray-900">
          Nothing here yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
          Blog posts will show up here once this page is built out.
        </p>
      </div>
    </div>
  );
}
