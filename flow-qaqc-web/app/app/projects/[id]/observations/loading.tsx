export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-16 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="flex-1 px-4 py-3 flex flex-col gap-3">
        <div className="h-12 bg-white rounded-xl shadow-subtle animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-subtle p-3 flex gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-gray-200" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-3 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-2.5 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
