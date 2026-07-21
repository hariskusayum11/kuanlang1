export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}
