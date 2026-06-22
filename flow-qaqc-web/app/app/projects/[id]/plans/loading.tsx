export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-20 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="flex-1 px-4 py-3 flex flex-col gap-3">
        <div className="h-10 bg-white border border-border rounded-lg animate-pulse self-start w-44" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-border shadow-subtle p-4 flex flex-col gap-2 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-gray-200" />
              <div className="flex-1 h-4 bg-gray-200 rounded w-1/3" />
              <div className="w-9 h-9 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
