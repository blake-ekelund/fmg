export function NotesSection() {
  return (
    <div className="max-w-2xl space-y-4">
      <label className="text-sm font-medium">
        Notes for 3rd Parties
      </label>
      <textarea
        rows={6}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-yellow-200"
      />
    </div>
  );
}
