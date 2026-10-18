export default function MapLoading() {
  // โครงเดียวกับ MapWorkspace: แผนที่เต็มความสูงใต้ header + แผงชั้นข้อมูลด้านขวา
  return (
    <div className="relative -mx-5 -my-6 h-[calc(100dvh-4rem)] overflow-hidden bg-slate-100 md:-mx-8 md:-my-8" role="status" aria-label="กำลังโหลดแผนที่">
      <div className="skeleton absolute inset-0 rounded-none" />
      <div className="absolute inset-x-0 bottom-0 h-14 rounded-t-2xl bg-white shadow-lg md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:h-[60%] md:w-[340px] md:rounded-2xl">
        <div className="hidden space-y-3 p-4 md:block">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
