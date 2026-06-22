export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header skeleton */}
      <div className="h-16 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="bg-white border-b border-divider px-4 py-2.5 flex items-center gap-2 animate-pulse">
        <div className="h-9 bg-gray-100 rounded-md flex-1" />
      </div>
      <div className="flex-1 px-4 py-3 flex flex-col gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-subtle p-4 flex items-center gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-gray-200" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3.5 bg-gray-200 rounded w-2/3" />
              <div className="h-2.5 bg-gray-100 rounded w-1/3" />
            </div>
            <div className="h-7 w-16 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
