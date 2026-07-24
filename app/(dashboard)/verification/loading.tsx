export default function VerificationLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-2 p-5">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="card p-6">
        <div className="skeleton mb-4 h-5 w-40" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
