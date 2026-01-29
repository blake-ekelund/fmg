export default function InventoryModeSwitch({
  mode,
  setMode,
}: {
  mode: "fg" | "bom";
  setMode: (m: "fg" | "bom") => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-white">
      {["fg", "bom"].map((m) => (
        <button
          key={m}
          onClick={() => setMode(m as "fg" | "bom")}
          className={`px-3 py-1.5 text-sm rounded-lg transition ${
            mode === m
              ? "bg-gray-100 text-black"
              : "text-gray-500 hover:text-black"
          }`}
        >
          {m === "fg" ? "Finished Goods" : "BOM Materials"}
        </button>
      ))}
    </div>
  );
}
