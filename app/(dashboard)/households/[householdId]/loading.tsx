export default function HouseholdViewLoading() {
  return (
    <div className="w-full space-y-6">
      <div className="skeleton h-8 w-40 rounded-full" />
      <div className="skeleton h-32 w-full rounded-3xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card space-y-3 p-6">
          <div className="skeleton h-5 w-48" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="skeleton h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
