export default function CommunitiesLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-6 w-28" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-5">
            <div className="skeleton mb-4 h-5 w-48" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="space-y-2">
                  <div className="skeleton h-3 w-16" />
                  <div className="skeleton h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
