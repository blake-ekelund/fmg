"use client";

import PageMeta from "@/components/PageMeta";

type PageHeaderProps = {
  /** Shown in the top bar (falls back to the nav label). */
  title?: string;
  /** One-sentence description — shown under the title in the top bar. */
  subtitle?: string;
  children?: React.ReactNode;
};

/** Publishes title/subtitle to the top bar; renders only the page actions. */
export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <>
      <PageMeta title={title} description={subtitle} />
      {children && (
        <header className="flex items-center justify-end gap-3">{children}</header>
      )}
    </>
  );
}
