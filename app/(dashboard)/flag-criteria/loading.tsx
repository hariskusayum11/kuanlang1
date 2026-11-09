export default function FlagCriteriaLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-7" role="status" aria-label="กำลังโหลดเกณฑ์ธงเตือนภัย">
      <div className="skeleton h-32 w-full rounded-3xl" />
      <div className="card space-y-3 p-6">
        <div className="skeleton h-5 w-40" />
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24 w-full" />)}
      </div>
      <div className="card space-y-3 p-6">
        <div className="skeleton h-5 w-56" />
        {Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton h-40 w-full" />)}
      </div>
    </div>
  );
}
