import { fetchDashboardCounts, toStatCards } from "@/lib/dashboard/stats";
import { APPLIED_MIGRATION_COUNT } from "@/lib/app-config";

export const metadata = { title: "ภาพรวม" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const counts = await fetchDashboardCounts();
  const cards = toStatCards(counts);

  return (
    <div className="space-y-6">
      {/* สถิติหลัก */}
      <section>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {cards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-sm text-slate-500">{card.label}</p>
              <p
                className={`mt-1 text-3xl font-bold ${
                  card.pending && card.value === 0 ? "text-slate-400" : "text-slate-900"
                }`}
              >
                {card.value.toLocaleString("th-TH")}
              </p>
              {card.pending && (
                <p className="mt-1 text-[11px] text-slate-400">โมดูลอยู่ระหว่างพัฒนา</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          ข้อมูลจากฐานข้อมูล Development · ระบบแบบสอบถามและข้อมูลครัวเรือนอยู่ระหว่างการพัฒนา
        </p>
      </section>

      {/* สถานะระบบ */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-900">สถานะระบบ</h2>
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
            <dt className="text-slate-600">ฐานข้อมูล</dt>
            <dd className="font-medium text-green-700">พร้อมใช้งาน</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
            <dt className="text-slate-600">Migration</dt>
            <dd className="font-medium text-slate-900">{APPLIED_MIGRATION_COUNT} ชุด</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
            <dt className="text-slate-600">Database constraints</dt>
            <dd className="font-medium text-green-700">ผ่าน</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
            <dt className="text-slate-600">โมดูลสำรวจครัวเรือน</dt>
            <dd className="font-medium text-slate-500">ยังไม่เปิดใช้งาน</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
