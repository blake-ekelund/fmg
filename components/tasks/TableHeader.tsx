export function TableHeader() {
  return (
    <div
      className="
        hidden md:grid
        items-center
        px-4 py-3
        text-xs font-medium text-gray-500
        bg-gray-50
      "
      style={{
        gridTemplateColumns:
          "40px 2fr 1fr 110px 140px 2fr 120px 80px",
      }}
    >
      <div></div>
      <div>Task</div>
      <div>Owner</div>
      <div>Priority</div>
      <div>Created</div>
      <div>Notes</div>
      <div>Status</div>
      <div className="text-right">Actions</div>
    </div>
  );
}
