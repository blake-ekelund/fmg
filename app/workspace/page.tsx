export default function WorkspacePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Workspace
      </h1>

      <p className="mt-3 text-gray-600 max-w-2xl">
        A shared space for internal ideas, issues, and assignments.
        This is where product thinking turns into action.
      </p>

      {/* Divider */}
      <div className="mt-10 border-t border-gray-200" />

      {/* Placeholder cards */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <PlaceholderCard
          title="Ideas"
          description="Capture product ideas, experiments, and improvements as they emerge."
        />
        <PlaceholderCard
          title="Issues"
          description="Track internal problems, bugs, and blockers that need attention."
        />
        <PlaceholderCard
          title="Assignments"
          description="Assign ownership and move work forward with clarity."
        />
      </div>

      {/* Footer hint */}
      <p className="mt-12 text-sm text-gray-400">
        Coming soon — shared ownership, status tracking, and internal visibility.
      </p>
    </div>
  );
}

function PlaceholderCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="font-medium tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-sm text-gray-600 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
