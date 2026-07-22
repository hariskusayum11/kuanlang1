export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-7" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
      <div className="space-y-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-5">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-8 w-12" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="card space-y-3 p-6">
        <div className="skeleton h-5 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
