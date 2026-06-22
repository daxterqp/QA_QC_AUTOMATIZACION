export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-16 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="flex-1 px-4 py-3 flex flex-col gap-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-subtle p-3 flex items-center gap-3 animate-pulse">
            <div className="w-8 h-8 rounded bg-gray-200" />
            <div className="flex-1 h-3 bg-gray-100 rounded" />
            <div className="w-16 h-6 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
