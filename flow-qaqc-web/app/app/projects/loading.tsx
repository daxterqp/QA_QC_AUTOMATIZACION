// loading.tsx — se muestra automáticamente durante el route transition a /app/projects.
// Replica el shape del skeleton de `page.tsx` para que la navegación se sienta instantánea.

export default function Loading() {
  return (
    <div className="min-h-screen bg-surface p-4 flex flex-col gap-3">
      <div className="h-20 rounded-lg bg-gradient-to-r from-[#0e213d] to-[#0c3d45] animate-pulse" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-card p-4 flex flex-col gap-3 animate-pulse">
          <div className="flex items-start gap-2">
            <div className="w-9 h-9 rounded-md bg-gray-200" />
            <div className="flex-1 flex flex-col gap-1.5 pt-0.5">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
          <div className="flex gap-1.5">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-8 bg-gray-100 rounded-md w-20" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
