export default function SurveysLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>
      <div className="card overflow-hidden">
        <div className="grid gap-px bg-slate-200/70 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 bg-white px-6 py-5">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-8 w-12" />
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200/70 px-6 py-5">
          <div className="skeleton h-10 w-48" />
        </div>
      </div>
      <div className="card p-6">
        <div className="skeleton mb-4 h-5 w-48" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
