export default function CommunityStatusLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="skeleton h-28 w-full rounded-3xl" />
      <div className="card overflow-hidden">
        <div className="flex gap-3 border-b-2 border-slate-100 px-6 py-4">
          <div className="skeleton h-10 w-48" />
          <div className="skeleton h-10 flex-1" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b-2 border-slate-50 px-6 py-4">
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-56" />
              <div className="skeleton h-3 w-80 max-w-full" />
            </div>
            <div className="skeleton h-8 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
