export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-20 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="flex-1 px-4 py-3 flex flex-col gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3 animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-200" />
              <div className="flex-1 h-4 bg-gray-200 rounded" />
              <div className="h-7 w-10 bg-gray-100 rounded-md" />
            </div>
            <div className="flex gap-2 ml-9">
              <div className="h-9 w-12 bg-gray-100 rounded-md" />
              <div className="h-9 w-12 bg-gray-100 rounded-md" />
              <div className="h-9 w-12 bg-gray-100 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
