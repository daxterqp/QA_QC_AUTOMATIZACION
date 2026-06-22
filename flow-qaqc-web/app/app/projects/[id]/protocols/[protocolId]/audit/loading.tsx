export default function Loading() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="h-20 bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 flex flex-col gap-3">
        {/* Dossier header skeleton */}
        <div className="bg-white rounded-md p-3.5 border border-border shadow-subtle animate-pulse flex flex-col gap-3">
          <div className="h-6 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
          <div className="flex justify-around mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-14 h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>

        {/* Items table skeleton */}
        <div className="bg-white rounded-md border border-border shadow-subtle overflow-hidden animate-pulse">
          <div className="h-9 bg-navy" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center px-3 py-3 border-b border-divider">
              <div className="w-7 h-3 bg-gray-200 rounded" />
              <div className="flex-1 ml-2 h-3 bg-gray-100 rounded" />
              <div className="w-12 h-6 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
