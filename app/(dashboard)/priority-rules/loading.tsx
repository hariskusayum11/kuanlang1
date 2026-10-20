export default function PriorityRulesLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-7" role="status" aria-label="กำลังโหลดกฎการจัดลำดับ">
      <div className="skeleton h-32 w-full rounded-3xl" />
      <div className="card space-y-3 p-6">
        <div className="skeleton h-5 w-64" />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="skeleton h-36" />
          <div className="skeleton h-36" />
          <div className="skeleton h-36" />
        </div>
      </div>
      <div className="card space-y-2 p-6">
        <div className="skeleton h-5 w-56" />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-8 w-full" />)}
      </div>
    </div>
  );
}
