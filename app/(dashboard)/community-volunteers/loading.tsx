export default function CommunityVolunteersLoading() {
  return (
    <div className="w-full space-y-6">
      <div className="skeleton h-28 w-full rounded-3xl" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="card overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-b-2 border-slate-50 px-6 py-4">
            <div className="skeleton h-4 w-48" />
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-6 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
