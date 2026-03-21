"use client";

type PageHeaderProps = {
  title?: string; // kept for backwards compat but no longer rendered
  subtitle?: string;
  children?: React.ReactNode;
};

export default function PageHeader({
  subtitle,
  children,
}: PageHeaderProps) {
  if (!subtitle && !children) return null;

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: subtitle */}
      {subtitle && (
        <p className="text-sm text-gray-500">{subtitle}</p>
      )}

      {/* Right: page-specific actions */}
      {children && (
        <div className="flex items-center gap-3 shrink-0">{children}</div>
      )}
    </header>
  );
}
